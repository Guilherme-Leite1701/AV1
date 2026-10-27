import { describe, expect, it } from 'vitest';
import { ValidadorCNPJ } from '../../src/domain/validadores/ValidadorCNPJ';

describe('ValidadorCNPJ', () => {
  const validador = new ValidadorCNPJ();

  it.each(['11222333000181', '11.222.333/0001-81', '04.252.011/0001-10'])('aceita CNPJ válido %s', (cnpj) => {
    expect(validador.validar(cnpj)).toBe(true);
    expect(validador.obterMensagemErro()).toBe('');
  });

  it('aceita CNPJ alfanumérico (padrão a partir de julho/2026)', () => {
    expect(validador.validar('12.ABC.345/01DE-35')).toBe(true);
  });

  it('rejeita dígitos verificadores errados', () => {
    expect(validador.validar('11222333000182')).toBe(false);
    expect(validador.obterMensagemErro()).toMatch(/dígitos verificadores/);
  });

  it.each(['00000000000000', '11111111111111', '99.999.999/9999-99'])('rejeita sequência repetida %s', (cnpj) => {
    expect(validador.validar(cnpj)).toBe(false);
    expect(validador.obterMensagemErro()).toMatch(/iguais/);
  });

  it.each(['', '123', '1122233300018', '112223330001811', 'AB222333000181X'])('rejeita formato inválido "%s"', (cnpj) => {
    expect(validador.validar(cnpj)).toBe(false);
  });

  it('calcula os dígitos verificadores de uma base de 12 caracteres', () => {
    expect(ValidadorCNPJ.calcularDigitosVerificadores('112223330001')).toBe('81');
  });

  it('normaliza a máscara', () => {
    expect(ValidadorCNPJ.normalizar('11.222.333/0001-81')).toBe('11222333000181');
  });
});
