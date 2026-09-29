import { StatusRastreamento } from '../enums/StatusRastreamento';
import { ServicoEquipamento } from './ServicoEquipamento';
import { ServicoLote } from './ServicoLote';
import { ServicoParametros } from './ServicoParametros';

/** Relatórios de rastreabilidade (FR11). */
export class ServicoRelatorio {
  private servicoLote: ServicoLote;
  private servicoEquipamento: ServicoEquipamento;
  private servicoParametros: ServicoParametros;

  constructor(servicoLote: ServicoLote, servicoEquipamento: ServicoEquipamento, servicoParametros: ServicoParametros) {
    this.servicoLote = servicoLote;
    this.servicoEquipamento = servicoEquipamento;
    this.servicoParametros = servicoParametros;
  }

  public gerarRelatorioPorOrganizacao(organizacaoId: string, periodo: { inicio: Date; fim: Date }): string {
    const lotes = this.servicoLote
      .consultarLotePorPeriodo(periodo.inicio, periodo.fim)
      .filter((l) => l.getOrganizacaoId() === organizacaoId);

    const linhas = [
      `Relatório da organização ${organizacaoId}`,
      `Período: ${this.formatarData(periodo.inicio)} a ${this.formatarData(periodo.fim)}`,
      '',
    ];
    let totalEquipamentos = 0;
    let pesoTotal = 0;
    for (const lote of lotes) {
      const quantidade = lote.getEquipamentos().length;
      const peso = lote.calcularPesoTotal();
      totalEquipamentos += quantidade;
      pesoTotal += peso;
      linhas.push(
        `- Lote ${lote.getId()} | ${this.formatarData(lote.getDataEntrada())} | NF ${lote.getNotaFiscal()} | ` +
          `${quantidade} equip. | ${peso.toFixed(2)} kg | ${lote.getStatusProcessamento()}`,
      );
    }
    if (lotes.length === 0) linhas.push('Nenhum lote no período.');
    linhas.push('', `Total: ${lotes.length} lote(s), ${totalEquipamentos} equipamento(s), ${pesoTotal.toFixed(2)} kg`);
    return linhas.join('\n');
  }

  public gerarRelatorioPorStatus(status: StatusRastreamento): string {
    const linhas = [`Equipamentos com status ${status}`, ''];
    for (const lote of this.todosOsLotes()) {
      for (const equipamento of lote.getEquipamentos()) {
        if (equipamento.getStatusRastreamento() !== status) continue;
        const historico = this.servicoEquipamento.rastrearEquipamento(equipamento.getId());
        const ultima = historico.movimentacoes[historico.movimentacoes.length - 1];
        linhas.push(
          `- ${equipamento.getCodigoBarrasInterno()} | ${equipamento.getTipo()} ${equipamento.getMarca()} ${equipamento.getModelo()} | ` +
            `lote ${lote.getId()} | última movimentação: ${ultima ? this.formatarData(ultima.getDataHora()) : '—'}`,
        );
      }
    }
    if (linhas.length === 2) linhas.push('Nenhum equipamento com este status.');
    return linhas.join('\n');
  }

  /** Resumo de depreciação dos equipamentos recebidos no período (coeficiente global do Administrador). */
  public gerarRelatorioFinanceiro(periodo: { inicio: Date; fim: Date }): string {
    const coeficiente = this.servicoParametros.obter().coeficienteDepreciacao;
    const lotes = this.servicoLote.consultarLotePorPeriodo(periodo.inicio, periodo.fim);
    const linhas = [
      'Relatório financeiro — depreciação',
      `Período: ${this.formatarData(periodo.inicio)} a ${this.formatarData(periodo.fim)}`,
      `Coeficiente de depreciação anual: ${(coeficiente * 100).toFixed(1)}%`,
      '',
    ];
    let soma = 0;
    let quantidade = 0;
    for (const lote of lotes) {
      const equipamentos = lote.getEquipamentos();
      if (equipamentos.length === 0) continue;
      const somaLote = equipamentos.reduce((t, e) => t + e.calcularDepreciacao(coeficiente), 0);
      soma += somaLote;
      quantidade += equipamentos.length;
      linhas.push(
        `- Lote ${lote.getId()} | ${equipamentos.length} equip. | depreciação média ${(100 * somaLote / equipamentos.length).toFixed(1)}%`,
      );
    }
    if (quantidade > 0) {
      linhas.push('', `Geral: ${quantidade} equipamento(s), depreciação média ${(100 * soma / quantidade).toFixed(1)}%`);
    } else {
      linhas.push('Nenhum equipamento no período.');
    }
    return linhas.join('\n');
  }

  private todosOsLotes() {
    return this.servicoLote.consultarLotePorPeriodo(new Date(0), new Date(8.64e15));
  }

  private formatarData(data: Date): string {
    return data.toLocaleDateString('pt-BR');
  }
}
