import { StatusLote } from '../domain/enums/StatusLote';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { ErroNaoEncontrado } from '../domain/erros/ErrosAplicacao';
import { arredondar2 } from '../domain/utils/datas';
import { EquipamentoComOrigem, EquipamentoRepository } from '../repositories/EquipamentoRepository';
import { JournalRepository } from '../repositories/JournalRepository';
import { LoteRepository } from '../repositories/LoteRepository';
import { OrganizacaoRepository } from '../repositories/OrganizacaoRepository';
import { ServicoParametros } from './ServicoParametros';
import { Periodo, Relogio, relogioDoSistema } from './tipos';

interface Acumulado {
  quantidade: number;
  pesoKg: number;
}

export class ServicoRelatorio {
  constructor(
    private readonly lotes: LoteRepository,
    private readonly equipamentos: EquipamentoRepository,
    private readonly organizacoes: OrganizacaoRepository,
    private readonly journal: JournalRepository,
    private readonly parametros: ServicoParametros,
    private readonly relogio: Relogio = relogioDoSistema,
  ) {}

  public async gerarRelatorioPorOrganizacao(organizacaoId: string, periodo: Periodo) {
    const organizacao = await this.organizacoes.buscarPorId(organizacaoId);
    if (!organizacao) throw new ErroNaoEncontrado('Organização', organizacaoId);

    const filtroLote = { organizacaoId, inicio: periodo.inicio, fim: periodo.fim };
    const lotes = await this.lotes.listar(filtroLote);
    const itens = await this.equipamentos.listarComOrigem({ lote: filtroLote });

    const lotesPorStatus: Partial<Record<StatusLote, number>> = {};
    for (const { lote } of lotes) {
      lotesPorStatus[lote.statusProcessamento] = (lotesPorStatus[lote.statusProcessamento] ?? 0) + 1;
    }

    return {
      organizacao: { id: organizacao.id, razaoSocial: organizacao.razaoSocial, cnpj: organizacao.cnpj },
      periodo,
      totalLotes: lotes.length,
      totalEquipamentos: itens.length,
      pesoTotalProcessadoKg: ServicoRelatorio.somarPeso(itens),
      lotesPorStatus,
      distribuicaoPorTipo: ServicoRelatorio.agrupar(itens, (i) => i.equipamento.tipo),
      distribuicaoPorStatus: ServicoRelatorio.agrupar(itens, (i) => i.equipamento.statusRastreamento),
      lotes: lotes.map(({ lote, quantidadeEquipamentos, pesoTotal }) => ({
        ...lote.paraJSON(),
        quantidadeEquipamentos,
        pesoTotalKg: pesoTotal,
      })),
    };
  }

  public async gerarRelatorioPorStatus(status: StatusRastreamento) {
    const itens = await this.equipamentos.listarComOrigem({ status: [status] });
    return {
      status,
      quantidade: itens.length,
      pesoAcumuladoKg: ServicoRelatorio.somarPeso(itens),
      porTipo: ServicoRelatorio.agrupar(itens, (i) => i.equipamento.tipo),
      equipamentos: itens.map(({ equipamento, lote, organizacao }) => ({
        ...equipamento.paraJSON(),
        lote,
        organizacao,
      })),
    };
  }

  /** L = (R_contratos + V_recuperado) − C_descarte − impostos. Fórmulas no ARQUITETURA_AV2.md. */
  public async gerarRelatorioFinanceiro(periodo: Periodo) {
    const parametros = await this.parametros.obterValores();
    const anoAtual = this.relogio().getFullYear();

    const contratos = await this.organizacoes.listarContratosDeOrganizacoesAtivas();
    const detalheContratos = contratos
      .map(({ contrato, razaoSocial }) => {
        const meses = contrato.mesesVigentesNoPeriodo(periodo.inicio, periodo.fim);
        return { organizacaoId: contrato.organizacaoId, razaoSocial, valorMensal: contrato.valorMensal, mesesFaturados: meses, receita: arredondar2(meses * contrato.valorMensal) };
      })
      .filter((c) => c.mesesFaturados > 0);
    const receitaContratos = arredondar2(detalheContratos.reduce((t, c) => t + c.receita, 0));

    const recuperados = await this.equipamentos.listarComOrigem({
      status: [StatusRastreamento.PECAS_REAPROVEITADAS, StatusRastreamento.MATERIAL_RECICLAVEL],
      lote: { inicio: periodo.inicio, fim: periodo.fim },
    });
    let valorResidual = 0;
    let bonusMetalNobre = 0;
    const detalheRecuperados = recuperados.map(({ equipamento }) => {
      const { valorAtual } = equipamento.calcularDepreciacao(parametros.COEFICIENTE_DEPRECIACAO_ANUAL, anoAtual);
      const bonus =
        equipamento.statusRastreamento === StatusRastreamento.MATERIAL_RECICLAVEL ? equipamento.calcularBonusMetalNobre() : 0;
      valorResidual += valorAtual;
      bonusMetalNobre += bonus;
      return {
        codigoBarrasInterno: equipamento.codigoBarrasInterno,
        tipo: equipamento.tipo,
        status: equipamento.statusRastreamento,
        valorResidual: valorAtual,
        bonusMetalNobre: bonus,
      };
    });
    const valorRecuperado = arredondar2(valorResidual + bonusMetalNobre);

    const descartados = await this.equipamentos.listarComOrigem({
      status: [StatusRastreamento.DESCARTE_SEGURO],
      lote: { inicio: periodo.inicio, fim: periodo.fim },
    });
    const pesoDescarteKg = ServicoRelatorio.somarPeso(descartados);
    const custoDescarte = arredondar2(pesoDescarteKg * parametros.CUSTO_DESCARTE_POR_KG);

    const receitaBruta = arredondar2(receitaContratos + valorRecuperado);
    const impostos = arredondar2(receitaBruta * parametros.ALIQUOTA_IMPOSTO_PADRAO);
    const resultadoLiquido = arredondar2(receitaBruta - custoDescarte - impostos);

    return {
      periodo,
      parametros,
      receitaContratos,
      valorRecuperado,
      custoDescarte,
      receitaBruta,
      impostos,
      resultadoLiquido,
      detalhes: {
        contratos: detalheContratos,
        ativosRecuperados: {
          quantidade: recuperados.length,
          valorResidual: arredondar2(valorResidual),
          bonusMetalNobre: arredondar2(bonusMetalNobre),
          itens: detalheRecuperados,
        },
        descarteSeguro: { quantidade: descartados.length, pesoKg: pesoDescarteKg },
      },
    };
  }

  public listarJournal(filtros: { entidade?: string; usuario?: string; limite: number }) {
    return this.journal.listar(filtros);
  }

  private static somarPeso(itens: EquipamentoComOrigem[]): number {
    return arredondar2(itens.reduce((t, i) => t + i.equipamento.pesoQuilogramas, 0));
  }

  private static agrupar<K extends string>(itens: EquipamentoComOrigem[], chave: (i: EquipamentoComOrigem) => K) {
    const grupos: Partial<Record<K, Acumulado>> = {};
    for (const item of itens) {
      const k = chave(item);
      const atual = grupos[k] ?? { quantidade: 0, pesoKg: 0 };
      grupos[k] = { quantidade: atual.quantidade + 1, pesoKg: arredondar2(atual.pesoKg + item.equipamento.pesoQuilogramas) };
    }
    return grupos;
  }
}

