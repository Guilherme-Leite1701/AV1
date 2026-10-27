import { DadosNovoEquipamento, Equipamento } from '../domain/entidades/Equipamento';
import { GeradorCodigoBarras } from '../domain/entidades/GeradorCodigoBarras';
import { Lote } from '../domain/entidades/Lote';
import { EstadoFisico } from '../domain/enums/EstadoFisico';
import { StatusLote } from '../domain/enums/StatusLote';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';
import {
  ErroAplicacao,
  ErroConflito,
  ErroNaoEncontrado,
  ErroRegraNegocio,
  ErroValidacao,
} from '../domain/erros/ErrosAplicacao';
import { arredondar2 } from '../domain/utils/datas';
import { ValidadorDataEntrada } from '../domain/validadores/ValidadorDataEntrada';
import { ContadorRepository } from '../repositories/ContadorRepository';
import { EquipamentoRepository } from '../repositories/EquipamentoRepository';
import { GerenciadorTransacao } from '../repositories/infra';
import { JournalRepository } from '../repositories/JournalRepository';
import { FiltrosLote, LoteRepository } from '../repositories/LoteRepository';
import { MovimentacaoRepository } from '../repositories/MovimentacaoRepository';
import { OrganizacaoRepository } from '../repositories/OrganizacaoRepository';
import { ServicoParametros } from './ServicoParametros';
import { Relogio, UsuarioAutenticado, relogioDoSistema } from './tipos';

export interface DadosCriacaoLote {
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  dataEntrada?: Date;
  observacoes?: string;
}

export class ServicoLote {
  public static readonly LOCAL_ALMOXARIFADO = 'Almoxarifado';
  public static readonly LOCAL_TRIAGEM = 'Área de triagem';

  constructor(
    private readonly lotes: LoteRepository,
    private readonly organizacoes: OrganizacaoRepository,
    private readonly equipamentos: EquipamentoRepository,
    private readonly movimentacoes: MovimentacaoRepository,
    private readonly contadores: ContadorRepository,
    private readonly journal: JournalRepository,
    private readonly transacao: GerenciadorTransacao,
    private readonly parametros: ServicoParametros,
    private readonly relogio: Relogio = relogioDoSistema,
  ) {}

  /** Valida a janela de 90 dias, a organização ativa e o contrato (renovando-o se for automático). */
  public async criarLote(dados: DadosCriacaoLote, quem: UsuarioAutenticado) {
    const agora = this.relogio();
    const dataEntrada = dados.dataEntrada ?? agora;
    const validador = new ValidadorDataEntrada(() => agora);
    if (!validador.validar(dataEntrada)) throw new ErroRegraNegocio(validador.obterMensagemErro());

    return this.transacao.executar(async (tx) => {
      const organizacao = await this.organizacoes.buscarPorId(dados.organizacaoId, tx);
      if (!organizacao) throw new ErroNaoEncontrado('Organização', dados.organizacaoId);
      organizacao.garantirAtiva();

      const contrato = organizacao.obterContratoVigente();
      const contratoAntes = contrato.paraJSON();
      const situacao = contrato.avaliarRecebimentoDeLote(agora);
      let contratoRenovado = null;
      if (situacao.renovado) {
        const renovado = await this.organizacoes.atualizarVencimentoContrato(
          contrato.id,
          contrato.versao,
          situacao.novoVencimento,
          tx,
        );
        await this.journal.registrar(
          {
            operacao: 'RENOVACAO_AUTOMATICA',
            entidade: 'Contrato',
            dadosAntes: contratoAntes,
            dadosDepois: renovado.paraJSON(),
            usuarioResponsavel: quem.usuario,
          },
          tx,
        );
        contratoRenovado = { vencimentoAnterior: situacao.vencimentoAnterior, novoVencimento: situacao.novoVencimento };
      }

      if (await this.lotes.existeNotaFiscal(dados.notaFiscal, tx)) {
        throw new ErroConflito(`Já existe um lote com a nota fiscal ${dados.notaFiscal}.`);
      }
      const lote = await this.lotes.criar(
        {
          dataEntrada,
          organizacaoId: organizacao.id,
          notaFiscal: dados.notaFiscal,
          transportadora: dados.transportadora,
          observacoes: dados.observacoes ?? '',
        },
        tx,
      );
      await this.journal.registrar(
        { operacao: 'CRIAR', entidade: 'Lote', dadosDepois: lote.paraJSON(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return { lote: lote.paraJSON(), contratoRenovado };
    });
  }

  public async listarLotes(filtros: FiltrosLote) {
    const lista = await this.lotes.listar(filtros);
    return lista.map(({ lote, quantidadeEquipamentos, pesoTotal }) => ({
      ...lote.paraJSON(),
      quantidadeEquipamentos,
      pesoTotalKg: pesoTotal,
    }));
  }

  public async buscarLote(id: string) {
    const lote = await this.obterLote(id);
    const equipamentos = await this.equipamentos.listarPorLote(id);
    return {
      ...lote.paraJSON(),
      pesoTotalKg: Lote.calcularPesoTotal(equipamentos),
      equipamentos: equipamentos.map((e) => e.paraJSON()),
    };
  }

  public async calcularPesoTotal(loteId: string): Promise<number> {
    await this.obterLote(loteId);
    return Lote.calcularPesoTotal(await this.equipamentos.listarPorLote(loteId));
  }

  /** Tudo ou nada: se um item for inválido, nenhum é gravado. */
  public async adicionarEquipamentos(loteId: string, itens: DadosNovoEquipamento[], quem: UsuarioAutenticado) {
    if (itens.length === 0) throw new ErroValidacao('Informe ao menos um equipamento.');
    const ano = this.relogio().getFullYear();

    return this.transacao.executar(async (tx) => {
      const lote = await this.lotes.buscarPorId(loteId, tx);
      if (!lote) throw new ErroNaoEncontrado('Lote', loteId);
      lote.garantirAbertoParaEquipamentos();
      const dadosLote = lote.paraJSON();

      const criados: Equipamento[] = [];
      for (const [indice, item] of itens.entries()) {
        try {
          Equipamento.validarNovo(item, ano);
        } catch (erro) {
          if (erro instanceof ErroAplicacao) {
            throw new ErroRegraNegocio(`Equipamento #${indice + 1}: ${erro.message} Nenhum item do lote foi gravado.`);
          }
          throw erro;
        }
        const sequencia = await this.contadores.proximoValor(GeradorCodigoBarras.chaveContador(ano), tx);
        const equipamento = await this.equipamentos.criar(
          {
            ...item,
            marca: item.marca.trim(),
            modelo: item.modelo.trim(),
            codigoBarrasInterno: GeradorCodigoBarras.gerarCodigoBarras(item.tipo, ano, sequencia),
            loteId,
            posicaoNoLote: await this.equipamentos.proximaPosicaoNoLote(loteId, tx),
          },
          tx,
        );
        await this.movimentacoes.registrar(
          {
            equipamentoId: equipamento.id,
            origem: `Transportadora ${dadosLote.transportadora} (NF ${dadosLote.notaFiscal})`,
            destino: ServicoLote.LOCAL_ALMOXARIFADO,
            responsavel: quem.usuario,
            observacao: 'Entrada do equipamento no almoxarifado.',
          },
          tx,
        );
        await this.journal.registrar(
          { operacao: 'CRIAR', entidade: 'Equipamento', dadosDepois: equipamento.paraJSON(), usuarioResponsavel: quem.usuario },
          tx,
        );
        criados.push(equipamento);
      }
      return criados.map((e) => e.paraJSON());
    });
  }

  /** `versao` é a versão do equipamento. */
  public async removerEquipamento(loteId: string, equipamentoId: string, versao: number, quem: UsuarioAutenticado) {
    await this.transacao.executar(async (tx) => {
      const lote = await this.lotes.buscarPorId(loteId, tx);
      if (!lote) throw new ErroNaoEncontrado('Lote', loteId);
      lote.garantirAbertoParaEquipamentos();

      const equipamento = await this.equipamentos.buscarPorIdOuCodigo(equipamentoId, tx);
      if (!equipamento || equipamento.loteId !== loteId) throw new ErroNaoEncontrado('Equipamento no lote', equipamentoId);

      const historico = await this.movimentacoes.listarPorEquipamento(equipamento.id, tx);
      await this.equipamentos.excluir(equipamento.id, versao, tx); // movimentações apagadas em cascata
      await this.journal.registrar(
        {
          operacao: 'EXCLUIR',
          entidade: 'Equipamento',
          dadosAntes: { ...equipamento.paraJSON(), movimentacoes: historico },
          usuarioResponsavel: quem.usuario,
        },
        tx,
      );
    });
  }

  /** Avança um passo: RECEBIDO → EM_TRIAGEM (com os equipamentos) → TRIAGEM_CONCLUIDA. */
  public async processarTriagem(loteId: string, versao: number, quem: UsuarioAutenticado) {
    return this.transacao.executar(async (tx) => {
      const lote = await this.lotes.buscarPorId(loteId, tx);
      if (!lote) throw new ErroNaoEncontrado('Lote', loteId);
      const antes = lote.paraJSON();
      const equipamentos = await this.equipamentos.listarPorLote(loteId, tx);
      const passo = lote.avancarTriagem(equipamentos.length);

      // O lote primeiro: versão desatualizada aborta antes de mexer nos equipamentos.
      const atualizado = await this.lotes.atualizarStatus(loteId, versao, passo.novo, tx);

      const equipamentosAtualizados: string[] = [];
      if (passo.novo === StatusLote.EM_TRIAGEM) {
        for (const equipamento of equipamentos) {
          equipamento.iniciarTriagem();
          await this.equipamentos.atualizar(
            equipamento.id,
            equipamento.versao,
            { statusRastreamento: StatusRastreamento.EM_TRIAGEM },
            tx,
          );
          const ultima = await this.movimentacoes.ultimaDoEquipamento(equipamento.id, tx);
          await this.movimentacoes.registrar(
            {
              equipamentoId: equipamento.id,
              origem: ultima ? ultima.destino : `Lote ${loteId}`,
              destino: ServicoLote.LOCAL_TRIAGEM,
              responsavel: quem.usuario,
              observacao: `Status: ${StatusRastreamento.AGUARDANDO_TRIAGEM} → ${StatusRastreamento.EM_TRIAGEM}. Início da triagem do lote.`,
            },
            tx,
          );
          equipamentosAtualizados.push(equipamento.codigoBarrasInterno);
        }
      }

      await this.journal.registrar(
        {
          operacao: 'TRIAGEM',
          entidade: 'Lote',
          dadosAntes: antes,
          dadosDepois: { ...atualizado.paraJSON(), equipamentosAtualizados },
          usuarioResponsavel: quem.usuario,
        },
        tx,
      );
      return { lote: atualizado.paraJSON(), passo, equipamentosAtualizados };
    });
  }

  public async gerarRelatorioTriagem(loteId: string) {
    const lote = await this.obterLote(loteId);
    const organizacao = await this.organizacoes.buscarPorId(lote.organizacaoId);
    const equipamentos = await this.equipamentos.listarPorLote(loteId);
    const { COEFICIENTE_DEPRECIACAO_ANUAL } = await this.parametros.obterValores();
    const anoAtual = this.relogio().getFullYear();

    const porStatus = ServicoLote.contar(Object.values(StatusRastreamento), equipamentos, (e) => e.statusRastreamento);
    const porEstadoFisico = ServicoLote.contar(Object.values(EstadoFisico), equipamentos, (e) => e.estadoFisico);
    const porTipo = ServicoLote.contar(Object.values(TipoEquipamento), equipamentos, (e) => e.tipo);

    const itens = equipamentos.map((e) => {
      const { valorAtual, percentualDepreciacao } = e.calcularDepreciacao(COEFICIENTE_DEPRECIACAO_ANUAL, anoAtual);
      return { ...e.paraJSON(), valorResidual: valorAtual, percentualDepreciacao };
    });

    return {
      lote: lote.paraJSON(),
      organizacao: organizacao ? { id: organizacao.id, razaoSocial: organizacao.razaoSocial } : null,
      totalEquipamentos: equipamentos.length,
      pesoTotalKg: Lote.calcularPesoTotal(equipamentos),
      valorResidualTotal: arredondar2(itens.reduce((t, i) => t + i.valorResidual, 0)),
      coeficienteDepreciacaoAnual: COEFICIENTE_DEPRECIACAO_ANUAL,
      porStatus,
      porEstadoFisico,
      porTipo,
      equipamentos: itens,
    };
  }

  private async obterLote(id: string): Promise<Lote> {
    const lote = await this.lotes.buscarPorId(id);
    if (!lote) throw new ErroNaoEncontrado('Lote', id);
    return lote;
  }

  private static contar<K extends string>(chaves: K[], equipamentos: Equipamento[], extrair: (e: Equipamento) => K) {
    const resultado: Partial<Record<K, number>> = {};
    for (const chave of chaves) {
      const quantidade = equipamentos.filter((e) => extrair(e) === chave).length;
      if (quantidade > 0) resultado[chave] = quantidade;
    }
    return resultado;
  }
}
