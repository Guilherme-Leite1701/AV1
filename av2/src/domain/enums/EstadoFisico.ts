/** A ordem de declaração é a escala de degradação. */
export enum EstadoFisico {
  NOVO = 'NOVO',
  BOM_ESTADO = 'BOM_ESTADO',
  USADO_LEVE = 'USADO_LEVE',
  USADO_MODERADO = 'USADO_MODERADO',
  DANIFICADO_LEVE = 'DANIFICADO_LEVE',
  DANIFICADO_GRAVE = 'DANIFICADO_GRAVE',
  INSERVIVEL = 'INSERVIVEL',
}

/** 0 = NOVO ... 6 = INSERVIVEL */
export function indiceEstadoFisico(estado: EstadoFisico): number {
  return Object.values(EstadoFisico).indexOf(estado);
}
