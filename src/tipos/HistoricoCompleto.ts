import { Movimentacao } from '../dominio/Movimentacao';
import { EstadoFisico } from '../enums/EstadoFisico';
import { StatusRastreamento } from '../enums/StatusRastreamento';

/**
 * Retorno de ServicoEquipamento.rastrearEquipamento().
 * O UML cita este tipo mas não o define; esta é uma definição mínima.
 */
export interface HistoricoCompleto {
  equipamentoId: string;
  codigoBarrasInterno: string;
  loteId: string;
  estadoFisicoAtual: EstadoFisico;
  statusAtual: StatusRastreamento;
  movimentacoes: Movimentacao[];
}
