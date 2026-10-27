import { describe, expect, it } from 'vitest';
import { ValidadorDataEntrada } from '../../src/domain/validadores/ValidadorDataEntrada';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-10-26T15:00:00.000Z');

describe('ValidadorDataEntrada (janela de 90 dias)', () => {
  const validador = new ValidadorDataEntrada(() => AGORA);

  it('aceita o próprio instante "agora"', () => {
    expect(validador.validar(AGORA)).toBe(true);
  });

  it('aceita uma data de 30 dias atrás', () => {
    expect(validador.validar(new Date(AGORA.getTime() - 30 * DIA))).toBe(true);
  });

  it('aceita exatamente o limite de 90 dias', () => {
    expect(validador.validar(new Date(AGORA.getTime() - 90 * DIA))).toBe(true);
  });

  it('rejeita 90 dias e 1 minuto atrás', () => {
    expect(validador.validar(new Date(AGORA.getTime() - 90 * DIA - 60_000))).toBe(false);
    expect(validador.obterMensagemErro()).toMatch(/90 dias/);
  });

  it('rejeita data futura (mesmo 1 segundo à frente)', () => {
    expect(validador.validar(new Date(AGORA.getTime() + 1000))).toBe(false);
    expect(validador.obterMensagemErro()).toMatch(/futura/);
  });

  it('rejeita data inválida', () => {
    expect(validador.validar(new Date('não é data'))).toBe(false);
  });
});
