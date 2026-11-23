/** Ciclo de vida: PENDENTE → PROCESSANDO → CONCLUIDA | FALHOU (após esgotar as tentativas). */
export enum StatusTarefa {
  PENDENTE = 'PENDENTE',
  PROCESSANDO = 'PROCESSANDO',
  CONCLUIDA = 'CONCLUIDA',
  FALHOU = 'FALHOU',
}

export enum TipoRelatorioAssincrono {
  PREVISAO_VIDA_UTIL = 'PREVISAO_VIDA_UTIL',
  RASTREABILIDADE = 'RASTREABILIDADE',
  RENTABILIDADE = 'RENTABILIDADE',
}

export enum FormatoRelatorio {
  JSON = 'JSON',
  CSV = 'CSV',
}
