/** Parâmetros ajustáveis pelo Administrador, com valor padrão e limites. */
export const PARAMETROS_GLOBAIS = {
  ALIQUOTA_IMPOSTO_PADRAO: {
    padrao: 0.12,
    minimo: 0,
    maximo: 1,
    descricao: 'Alíquota de imposto aplicada sobre a receita bruta (0,12 = 12%).',
  },
  COEFICIENTE_DEPRECIACAO_ANUAL: {
    padrao: 0.15,
    minimo: 0,
    maximo: 1,
    descricao: 'Depreciação por ano de idade do equipamento (0,15 = 15% ao ano, teto de 90%).',
  },
  CUSTO_DESCARTE_POR_KG: {
    padrao: 4.5,
    minimo: 0,
    maximo: 10_000,
    descricao: 'Custo em R$ por kg de equipamento enviado para descarte seguro.',
  },
} as const;

export type ChaveParametro = keyof typeof PARAMETROS_GLOBAIS;

export const CHAVES_PARAMETROS = Object.keys(PARAMETROS_GLOBAIS) as ChaveParametro[];

export function ehChaveParametro(chave: string): chave is ChaveParametro {
  return (CHAVES_PARAMETROS as string[]).includes(chave);
}

export function valoresPadraoParametros(): Record<ChaveParametro, number> {
  const valores = {} as Record<ChaveParametro, number>;
  for (const chave of CHAVES_PARAMETROS) valores[chave] = PARAMETROS_GLOBAIS[chave].padrao;
  return valores;
}
