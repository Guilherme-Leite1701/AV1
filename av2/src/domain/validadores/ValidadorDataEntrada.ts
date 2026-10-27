import { Validador } from './Validador';

/** Data de entrada: não futura e no máximo 90 dias atrás. */
export class ValidadorDataEntrada extends Validador<Date> {
  public static readonly LIMITE_DIAS = 90;
  private static readonly MS_POR_DIA = 24 * 60 * 60 * 1000;

  constructor(private readonly relogio: () => Date = () => new Date()) {
    super();
  }

  public validar(data: Date): boolean {
    this.mensagemErro = '';

    if (!(data instanceof Date) || isNaN(data.getTime())) {
      this.mensagemErro = 'Data de entrada inválida.';
      return false;
    }

    const agora = this.relogio();
    if (data.getTime() > agora.getTime()) {
      this.mensagemErro = 'A data de entrada não pode ser futura.';
      return false;
    }

    const limite = new Date(agora.getTime() - ValidadorDataEntrada.LIMITE_DIAS * ValidadorDataEntrada.MS_POR_DIA);
    if (data.getTime() < limite.getTime()) {
      this.mensagemErro = `A data de entrada não pode ser anterior a ${ValidadorDataEntrada.LIMITE_DIAS} dias.`;
      return false;
    }
    return true;
  }
}
