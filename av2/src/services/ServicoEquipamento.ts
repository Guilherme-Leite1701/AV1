import { Lote } from '../domain/entidades/Lote';
import { Movimentacao } from '../domain/entidades/Movimentacao';
import { EstadoFisico } from '../domain/enums/EstadoFisico';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { ErroNaoEncontrado, ErroRegraNegocio } from '../domain/erros/ErrosAplicacao';
import { EquipamentoRepository } from '../repositories/EquipamentoRepository';
import { ClienteBD, GerenciadorTransacao } from '../repositories/infra';
import { JournalRepository } from '../repositories/JournalRepository';
import { LoteRepository } from '../repositories/LoteRepository';
import { MovimentacaoRepository } from '../repositories/MovimentacaoRepository';
import { OrganizacaoRepository } from '../repositories/OrganizacaoRepository';
import { ServicoParametros } from './ServicoParametros';
import { Relogio, UsuarioAutenticado, relogioDoSistema } from './tipos';

export class ServicoEquipamento {
  constructor(
    private readonly equipamentos: EquipamentoRepository,
    private readonly lotes: LoteRepository,
    private readonly organizacoes: OrganizacaoRepository,
    private readonly movimentacoes: MovimentacaoRepository,
    private readonly journal: JournalRepository,
    private readonly transacao: GerenciadorTransacao,
    private readonly parametros: ServicoParametros,
    private readonly relogio: Relogio = relogioDoSistema,
  ) {}

  public async rastrearEquipamento(idOuCodigo: string) {
    const equipamento = await this.equipamentos.buscarPorIdOuCodigo(idOuCodigo);
    if (!equipamento) throw new ErroNaoEncontrado('Equipamento', idOuCodigo);

    const lote = (await this.lotes.buscarPorId(equipamento.loteId)) as Lote;
    const organizacao = await this.organizacoes.buscarPorId(lote.organizacaoId);
    const historico = await this.movimentacoes.listarPorEquipamento(equipamento.id);
    const { COEFICIENTE_DEPRECIACAO_ANUAL } = await this.parametros.obterValores();

    return {
      equipamento: equipamento.paraJSON(),
      localAtual: Movimentacao.localAtual(historico, lote.id),
      valoracao: equipamento.calcularDepreciacao(COEFICIENTE_DEPRECIACAO_ANUAL, this.relogio().getFullYear()),
      lote: lote.paraJSON(),
      organizacao: organizacao
        ? { id: organizacao.id, razaoSocial: organizacao.razaoSocial, cnpj: organizacao.cnpj, ativo: organizacao.ativo }
        : null,
      movimentacoes: historico,
    };
  }

  /** Estado físico + movimentação + journal na mesma transação. */
  public async atualizarEstadoFisico(
    id: string,
    dados: { estadoFisico: EstadoFisico; justificativa?: string; versao: number },
    quem: UsuarioAutenticado,
  ) {
    return this.transacao.executar(async (tx) => {
      const equipamento = await this.obterEquipamento(id, tx);
      const antes = equipamento.paraJSON();
      const mudanca = equipamento.alterarEstadoFisico(dados.estadoFisico, dados.justificativa);

      const depois = await this.equipamentos.atualizar(equipamento.id, dados.versao, { estadoFisico: mudanca.novo }, tx);
      const local = await this.localAtual(equipamento.id, equipamento.loteId, tx);
      await this.movimentacoes.registrar(
        {
          equipamentoId: equipamento.id,
          origem: local,
          destino: local,
          responsavel: quem.usuario,
          observacao: ServicoEquipamento.observacao(`Estado físico: ${mudanca.anterior} → ${mudanca.novo}.`, dados.justificativa),
        },
        tx,
      );
      await this.journal.registrar(
        { operacao: 'ATUALIZAR', entidade: 'Equipamento', dadosAntes: antes, dadosDepois: depois.paraJSON(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return { equipamento: depois.paraJSON(), queda: mudanca.queda };
    });
  }

  /** Status + movimentação + status derivado do lote + journal na mesma transação. */
  public async atualizarStatus(
    id: string,
    dados: { status: StatusRastreamento; versao: number; justificativa?: string; destino?: string },
    quem: UsuarioAutenticado,
  ) {
    return this.transacao.executar(async (tx) => {
      const equipamento = await this.obterEquipamento(id, tx);
      const lote = (await this.lotes.buscarPorId(equipamento.loteId, tx)) as Lote;
      const antes = equipamento.paraJSON();
      const mudanca = equipamento.atualizarStatus(dados.status, lote.statusProcessamento);

      const depois = await this.equipamentos.atualizar(equipamento.id, dados.versao, { statusRastreamento: mudanca.novo }, tx);
      const origem = await this.localAtual(equipamento.id, equipamento.loteId, tx);
      await this.movimentacoes.registrar(
        {
          equipamentoId: equipamento.id,
          origem,
          destino: dados.destino?.trim() || origem,
          responsavel: quem.usuario,
          observacao: ServicoEquipamento.observacao(`Status: ${mudanca.anterior} → ${mudanca.novo}.`, dados.justificativa),
        },
        tx,
      );
      await this.journal.registrar(
        { operacao: 'ATUALIZAR', entidade: 'Equipamento', dadosAntes: antes, dadosDepois: depois.paraJSON(), usuarioResponsavel: quem.usuario },
        tx,
      );

      // O lote pode passar a ENCAMINHADO ou FINALIZADO.
      const statusDosEquipamentos = (await this.equipamentos.listarPorLote(lote.id, tx)).map((e) => e.statusRastreamento);
      const novoStatusLote = Lote.statusDerivado(lote.statusProcessamento, statusDosEquipamentos);
      let loteAtualizado = lote;
      if (novoStatusLote !== lote.statusProcessamento) {
        loteAtualizado = await this.lotes.atualizarStatus(lote.id, lote.versao, novoStatusLote, tx);
        await this.journal.registrar(
          {
            operacao: 'ATUALIZAR',
            entidade: 'Lote',
            dadosAntes: lote.paraJSON(),
            dadosDepois: loteAtualizado.paraJSON(),
            usuarioResponsavel: quem.usuario,
          },
          tx,
        );
      }
      return { equipamento: depois.paraJSON(), lote: loteAtualizado.paraJSON() };
    });
  }

  /** Troca de local, sem mudar status nem estado. */
  public async registrarMovimentacao(
    id: string,
    dados: { destino: string; observacao?: string },
    quem: UsuarioAutenticado,
  ) {
    return this.transacao.executar(async (tx) => {
      const equipamento = await this.obterEquipamento(id, tx);
      equipamento.garantirAlteravel();
      const origem = await this.localAtual(equipamento.id, equipamento.loteId, tx);
      const destino = dados.destino.trim();
      if (destino === origem) throw new ErroRegraNegocio(`O equipamento já está em "${origem}".`);

      const movimentacao = await this.movimentacoes.registrar(
        { equipamentoId: equipamento.id, origem, destino, responsavel: quem.usuario, observacao: dados.observacao?.trim() ?? '' },
        tx,
      );
      await this.journal.registrar(
        { operacao: 'CRIAR', entidade: 'Movimentacao', dadosDepois: movimentacao, usuarioResponsavel: quem.usuario },
        tx,
      );
      return movimentacao;
    });
  }

  private async obterEquipamento(id: string, tx: ClienteBD) {
    const equipamento = await this.equipamentos.buscarPorIdOuCodigo(id, tx);
    if (!equipamento) throw new ErroNaoEncontrado('Equipamento', id);
    return equipamento;
  }

  private async localAtual(equipamentoId: string, loteId: string, tx: ClienteBD): Promise<string> {
    const ultima = await this.movimentacoes.ultimaDoEquipamento(equipamentoId, tx);
    return ultima ? ultima.destino : `Lote ${loteId}`;
  }

  private static observacao(base: string, justificativa?: string): string {
    const texto = justificativa?.trim();
    return texto ? `${base} Justificativa: ${texto}` : base;
  }
}
