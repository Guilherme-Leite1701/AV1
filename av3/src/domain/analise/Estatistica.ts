import { max, mean, median, min, quantile, sampleStandardDeviation } from 'simple-statistics';
import { arredondar2 } from '../utils/datas';

/** Medidas descritivas de uma amostra (todas arredondadas em 2 casas). */
export interface ResumoEstatistico {
  n: number;
  media: number;
  mediana: number;
  desvioPadrao: number;
  p90: number;
  minimo: number;
  maximo: number;
  /** desvioPadrao / media, em %: mede a dispersão relativa. */
  coeficienteVariacaoPercentual: number;
}

/** Resume uma amostra com simple-statistics; null quando a amostra é vazia. */
export function resumir(valores: readonly number[]): ResumoEstatistico | null {
  if (valores.length === 0) return null;
  const media = mean(valores);
  const desvio = valores.length > 1 ? sampleStandardDeviation(valores) : 0;
  return {
    n: valores.length,
    media: arredondar2(media),
    mediana: arredondar2(median(valores)),
    desvioPadrao: arredondar2(desvio),
    p90: arredondar2(quantile(valores, 0.9)),
    minimo: arredondar2(min(valores)),
    maximo: arredondar2(max(valores)),
    coeficienteVariacaoPercentual: media === 0 ? 0 : arredondar2((desvio / Math.abs(media)) * 100),
  };
}

/** Escore-z de cada valor (0 quando não há dispersão). */
export function escoresZ(valores: readonly number[]): number[] {
  if (valores.length < 2) return valores.map(() => 0);
  const media = mean(valores);
  const desvio = sampleStandardDeviation(valores);
  return valores.map((v) => (desvio === 0 ? 0 : (v - media) / desvio));
}

/** Reta ajustada y = intercepto + coeficienteAngular · x, com a qualidade do ajuste. */
export interface ModeloLinear {
  coeficienteAngular: number;
  intercepto: number;
  /** Coeficiente de determinação R², entre 0 e 1. */
  r2: number;
  amostras: number;
}

/**
 * Mínimos quadrados ordinários implementado à mão (o teste unitário confere
 * contra o linearRegression do simple-statistics).
 *   b = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)²      a = ȳ − b·x̄      R² = 1 − SQres / SQtot
 */
export class RegressaoLinear {
  /** Ajusta a reta; null se houver menos de 2 pontos ou se todos os x forem iguais. */
  public static ajustar(pontos: readonly (readonly [number, number])[]): ModeloLinear | null {
    const n = pontos.length;
    if (n < 2) return null;
    const mediaX = pontos.reduce((t, [x]) => t + x, 0) / n;
    const mediaY = pontos.reduce((t, [, y]) => t + y, 0) / n;

    let somaXY = 0;
    let somaXX = 0;
    for (const [x, y] of pontos) {
      somaXY += (x - mediaX) * (y - mediaY);
      somaXX += (x - mediaX) ** 2;
    }
    if (somaXX === 0) return null;

    const coeficienteAngular = somaXY / somaXX;
    const intercepto = mediaY - coeficienteAngular * mediaX;
    return { coeficienteAngular, intercepto, r2: RegressaoLinear.r2(pontos, coeficienteAngular, intercepto), amostras: n };
  }

  /** Valor previsto pela reta em x. */
  public static prever(modelo: ModeloLinear, x: number): number {
    return modelo.intercepto + modelo.coeficienteAngular * x;
  }

  /** x em que a reta atinge y (null se a reta for horizontal). */
  public static resolverX(modelo: ModeloLinear, y: number): number | null {
    if (modelo.coeficienteAngular === 0) return null;
    return (y - modelo.intercepto) / modelo.coeficienteAngular;
  }

  private static r2(pontos: readonly (readonly [number, number])[], b: number, a: number): number {
    const mediaY = pontos.reduce((t, [, y]) => t + y, 0) / pontos.length;
    let residuos = 0;
    let total = 0;
    for (const [x, y] of pontos) {
      residuos += (y - (a + b * x)) ** 2;
      total += (y - mediaY) ** 2;
    }
    if (total === 0) return residuos === 0 ? 1 : 0;
    return Math.min(1, Math.max(0, 1 - residuos / total));
  }
}

/**
 * Suavização exponencial simples: S₁ = y₁ e Sₜ = α·yₜ + (1 − α)·Sₜ₋₁.
 * A previsão do próximo período é o último valor suavizado.
 */
export function suavizacaoExponencial(serie: readonly number[], alfa = 0.5): { suavizada: number[]; previsao: number | null } {
  if (alfa <= 0 || alfa > 1) throw new RangeError('O fator de suavização deve estar em (0, 1].');
  const suavizada: number[] = [];
  for (const [i, valor] of serie.entries()) {
    suavizada.push(i === 0 ? valor : alfa * valor + (1 - alfa) * suavizada[i - 1]);
  }
  return { suavizada: suavizada.map(arredondar2), previsao: suavizada.length ? arredondar2(suavizada[suavizada.length - 1]) : null };
}

/** Agrupa itens por uma chave textual, preservando a ordem de chegada. */
export function agruparPor<T>(itens: readonly T[], chave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = grupos.get(k);
    if (lista) lista.push(item);
    else grupos.set(k, [item]);
  }
  return grupos;
}
