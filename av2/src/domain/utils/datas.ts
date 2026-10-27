/** 31/01 + 1 mês = 28/02 (e não 03/03). */
export function adicionarMeses(data: Date, meses: number): Date {
  const resultado = new Date(data.getTime());
  const dia = resultado.getDate();
  resultado.setDate(1);
  resultado.setMonth(resultado.getMonth() + meses);
  const ultimoDiaDoMes = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(dia, ultimoDiaDoMes));
  return resultado;
}

export function arredondar2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function textoParaData(texto: string | undefined | null): Date | null {
  if (texto === undefined || texto === null || texto === '') return null;
  const data = new Date(texto);
  return isNaN(data.getTime()) ? null : data;
}
