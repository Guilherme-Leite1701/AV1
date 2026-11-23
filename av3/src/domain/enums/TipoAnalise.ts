export enum TipoAnalise {
  EFICIENCIA_OPERACIONAL = 'EFICIENCIA_OPERACIONAL',
  RENTABILIDADE = 'RENTABILIDADE',
  VIDA_UTIL = 'VIDA_UTIL',
}

/** Quem disparou a execução: o agendador (cron) ou uma pessoa/parceiro. */
export enum OrigemExecucao {
  AGENDADA = 'AGENDADA',
  SOB_DEMANDA = 'SOB_DEMANDA',
}
