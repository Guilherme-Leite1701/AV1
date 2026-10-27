import { Validador } from './Validador';

/** Módulo 11 da Receita Federal; aceita também o CNPJ alfanumérico. */
export class ValidadorCNPJ extends Validador<string> {
  private static readonly PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  private static readonly PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  public validar(cnpj: string): boolean {
    this.mensagemErro = '';

    if (typeof cnpj !== 'string' || cnpj.trim() === '') {
      this.mensagemErro = 'CNPJ não informado.';
      return false;
    }

    const limpo = ValidadorCNPJ.normalizar(cnpj);

    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(limpo)) {
      this.mensagemErro = 'CNPJ deve ter 14 caracteres: 12 letras/números seguidos de 2 dígitos verificadores.';
      return false;
    }

    if (/^(.)\1{13}$/.test(limpo)) {
      this.mensagemErro = 'CNPJ inválido: todos os caracteres são iguais.';
      return false;
    }

    const base = limpo.slice(0, 12);
    const dv1 = ValidadorCNPJ.calcularDigito(base, ValidadorCNPJ.PESOS_DV1);
    const dv2 = ValidadorCNPJ.calcularDigito(base + dv1, ValidadorCNPJ.PESOS_DV2);

    if (limpo.slice(12) !== `${dv1}${dv2}`) {
      this.mensagemErro = 'CNPJ inválido: dígitos verificadores não conferem.';
      return false;
    }
    return true;
  }

  /** "11.222.333/0001-81" → "11222333000181" */
  public static normalizar(cnpj: string): string {
    return String(cnpj).toUpperCase().replace(/[.\/\-\s]/g, '');
  }

  public static calcularDigitosVerificadores(base12: string): string {
    const dv1 = ValidadorCNPJ.calcularDigito(base12, ValidadorCNPJ.PESOS_DV1);
    const dv2 = ValidadorCNPJ.calcularDigito(base12 + dv1, ValidadorCNPJ.PESOS_DV2);
    return `${dv1}${dv2}`;
  }

  private static calcularDigito(base: string, pesos: number[]): number {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += (base.charCodeAt(i) - 48) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }
}
