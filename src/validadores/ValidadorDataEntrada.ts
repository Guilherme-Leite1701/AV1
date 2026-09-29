import { Validador } from './Validador';

/**
 * Valida a data de entrada de um Lote (FR04):
 * não pode ser futura nem anterior a 90 dias.
 * A comparação é feita por dia (a hora é ignorada).
 */
export class ValidadorDataEntrada extends Validador {
  public static readonly LIMITE_DIAS = 90;
  private static readonly MS_POR_DIA = 24 * 60 * 60 * 1000;

  public validar(data: Date): boolean {
    this.mensagemErro = '';

    if (!(data instanceof Date) || isNaN(data.getTime())) {
      this.mensagemErro = 'Data de entrada inválida.';
      return false;
    }

    const hoje = ValidadorDataEntrada.inicioDoDia(new Date());
    const dia = ValidadorDataEntrada.inicioDoDia(data);

    if (dia.getTime() > hoje.getTime()) {
      this.mensagemErro = 'Data de entrada não pode ser futura.';
      return false;
    }

    const diferencaDias = Math.round((hoje.getTime() - dia.getTime()) / ValidadorDataEntrada.MS_POR_DIA);
    if (diferencaDias > ValidadorDataEntrada.LIMITE_DIAS) {
      this.mensagemErro = `Data de entrada não pode ser anterior a ${ValidadorDataEntrada.LIMITE_DIAS} dias.`;
      return false;
    }

    return true;
  }

  private static inicioDoDia(data: Date): Date {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }
}
