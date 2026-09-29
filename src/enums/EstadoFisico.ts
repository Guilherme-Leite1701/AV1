/**
 * Estados físicos em ordem do melhor para o pior.
 * A ordem de declaração importa: é ela que define "cair duas categorias" (FR06).
 */
export enum EstadoFisico {
  NOVO = 'NOVO',
  BOM_ESTADO = 'BOM_ESTADO',
  USADO_LEVE = 'USADO_LEVE',
  USADO_MODERADO = 'USADO_MODERADO',
  DANIFICADO_LEVE = 'DANIFICADO_LEVE',
  DANIFICADO_GRAVE = 'DANIFICADO_GRAVE',
  INSERVIVEL = 'INSERVIVEL',
}

/** Posição do estado na escala (0 = NOVO, 6 = INSERVIVEL). */
export function ordemEstadoFisico(estado: EstadoFisico): number {
  return Object.values(EstadoFisico).indexOf(estado);
}
