import { Validador } from './Validador';

/**
 * Valida os dígitos verificadores do CNPJ (módulo 11).
 *
 * Aceita tanto o CNPJ numérico tradicional quanto o CNPJ alfanumérico
 * (letras nas 12 primeiras posições, em vigor a partir de julho/2026).
 * Cada caractere vale o seu código ASCII menos 48:
 * '0'..'9' → 0..9 e 'A' → 17, 'B' → 18, ... 'Z' → 42.
 * Os dois dígitos verificadores continuam sempre numéricos.
 */
export class ValidadorCNPJ extends Validador {
  private static readonly PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  private static readonly PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  public validar(cnpj: string): boolean {
    this.mensagemErro = '';

    if (typeof cnpj !== 'string' || cnpj.trim() === '') {
      this.mensagemErro = 'CNPJ não informado.';
      return false;
    }

    // Remove a máscara (pontos, barra, hífen e espaços).
    const limpo = cnpj.toUpperCase().replace(/[.\/\-\s]/g, '');

    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(limpo)) {
      this.mensagemErro = 'CNPJ deve ter 14 caracteres: 12 letras/números seguidos de 2 dígitos verificadores.';
      return false;
    }

    if (/^(\d)\1{13}$/.test(limpo)) {
      this.mensagemErro = 'CNPJ inválido: todos os dígitos são iguais.';
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

  private static calcularDigito(base: string, pesos: number[]): number {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += (base.charCodeAt(i) - 48) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }
}
