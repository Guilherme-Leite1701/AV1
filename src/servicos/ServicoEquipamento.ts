import { Equipamento } from '../dominio/Equipamento';
import { Lote } from '../dominio/Lote';
import { EstadoFisico } from '../enums/EstadoFisico';
import { StatusLote } from '../enums/StatusLote';
import { StatusRastreamento } from '../enums/StatusRastreamento';
import { TipoEquipamento } from '../enums/TipoEquipamento';
import { ARQUIVOS } from '../persistencia/arquivos';
import { RepositorioArquivo } from '../persistencia/RepositorioArquivo';
import { HistoricoCompleto } from '../tipos/HistoricoCompleto';

/**
 * Rastreamento, status, estado físico e código de barras dos equipamentos (FR05, FR06).
 */
export class ServicoEquipamento {
  private static readonly SIGLAS: Record<TipoEquipamento, string> = {
    [TipoEquipamento.COMPUTADOR_MESA]: 'CPU',
    [TipoEquipamento.NOTEBOOK]: 'NTB',
    [TipoEquipamento.MONITOR]: 'MON',
    [TipoEquipamento.IMPRESSORA]: 'IMP',
    [TipoEquipamento.SERVIDOR]: 'SRV',
    [TipoEquipamento.ROTEADOR]: 'RTD',
    [TipoEquipamento.CABO_ESTRUTURADO]: 'CAB',
    [TipoEquipamento.FONTE_ALIMENTACAO]: 'FNT',
  };
  private static readonly STATUS_DESMONTE = [StatusRastreamento.AGUARDANDO_DESMONTE, StatusRastreamento.EM_DESMONTE];
  private static readonly LOTE_TRIADO = [StatusLote.TRIAGEM_CONCLUIDA, StatusLote.ENCAMINHADO, StatusLote.FINALIZADO];

  private repositorio: RepositorioArquivo;

  constructor(repositorio: RepositorioArquivo) {
    this.repositorio = repositorio;
  }

  public rastrearEquipamento(id: string): HistoricoCompleto {
    const { equipamento } = this.localizar(id);
    return {
      equipamentoId: equipamento.getId(),
      codigoBarrasInterno: equipamento.getCodigoBarrasInterno(),
      loteId: equipamento.getLoteId(),
      estadoFisicoAtual: equipamento.getEstadoFisico(),
      statusAtual: equipamento.getStatusRastreamento(),
      movimentacoes: equipamento.getHistoricoMovimentacao(),
    };
  }

  /** Queda de duas categorias ou mais exige justificativa (FR06). */
  public atualizarEstadoFisico(id: string, novoEstado: EstadoFisico, justificativa?: string, responsavel?: string): void {
    const { lote, equipamento } = this.localizar(id);
    equipamento.alterarEstadoFisico(novoEstado, justificativa, responsavel);
    this.repositorio.salvarEntidade(ARQUIVOS.LOTES, lote);
  }

  /** Regra: só vai para desmonte depois que a triagem do lote foi concluída. */
  public atualizarStatus(id: string, novoStatus: StatusRastreamento, justificativa: string, responsavel?: string): void {
    const { lote, equipamento } = this.localizar(id);
    if (
      ServicoEquipamento.STATUS_DESMONTE.includes(novoStatus) &&
      !ServicoEquipamento.LOTE_TRIADO.includes(lote.getStatusProcessamento())
    ) {
      throw new Error(`O equipamento só pode ir para desmonte após a triagem completa do lote ${lote.getId()}.`);
    }
    equipamento.atualizarStatus(novoStatus, justificativa, responsavel);
    this.repositorio.salvarEntidade(ARQUIVOS.LOTES, lote);
  }

  public registrarMovimentacao(id: string, destino: string, responsavel: string): void {
    const { lote, equipamento } = this.localizar(id);
    equipamento.registrarMovimentacao(destino, responsavel);
    this.repositorio.salvarEntidade(ARQUIVOS.LOTES, lote);
  }

  /** Ex.: (NOTEBOOK, 42) → "GC-NTB-000042". */
  public gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number): string {
    if (!Number.isInteger(sequencia) || sequencia <= 0 || sequencia > 999999) {
      throw new Error('A sequência deve ser um inteiro entre 1 e 999999.');
    }
    return `GC-${ServicoEquipamento.SIGLAS[tipo]}-${String(sequencia).padStart(6, '0')}`;
  }

  /** Próximo número livre, usado no id (EQP-000042) e no código de barras. */
  public proximaSequencia(): number {
    let maior = 0;
    for (const dados of this.repositorio.listarEntidades(ARQUIVOS.LOTES)) {
      for (const e of dados.equipamentos ?? []) {
        maior = Math.max(maior, Number(String(e.id).replace('EQP-', '')) || 0);
      }
    }
    return maior + 1;
  }

  /** O equipamento é gravado dentro do lote; por isso a busca percorre os lotes. */
  private localizar(id: string): { lote: Lote; equipamento: Equipamento } {
    for (const dados of this.repositorio.listarEntidades(ARQUIVOS.LOTES)) {
      const lote = Lote.reconstruir(dados);
      const equipamento = lote.getEquipamentos().find((e) => e.getId() === id || e.getCodigoBarrasInterno() === id);
      if (equipamento) return { lote, equipamento };
    }
    throw new Error(`Equipamento ${id} não encontrado.`);
  }
}
