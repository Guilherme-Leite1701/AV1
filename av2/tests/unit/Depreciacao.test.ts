import { describe, expect, it } from 'vitest';
import { EstadoFisico } from '../../src/domain/enums/EstadoFisico';
import { TipoEquipamento } from '../../src/domain/enums/TipoEquipamento';
import { criarEquipamento } from './fabricas';

describe('Equipamento.calcularDepreciacao()', () => {
  it('NOTEBOOK de 2022, USADO_LEVE, em 2026 → V_atual = 4500 × (1 − 0,60) × 0,70 = R$ 1.260 (72%)', () => {
    const eq = criarEquipamento({ anoFabricacao: 2022, estadoFisico: EstadoFisico.USADO_LEVE });
    const r = eq.calcularDepreciacao(0.15, 2026);
    expect(r.idade).toBe(4);
    expect(r.valorBase).toBe(4500);
    expect(r.fatorEstado).toBe(0.7);
    expect(r.valorAtual).toBe(1260);
    expect(r.percentualDepreciacao).toBe(72);
  });

  it('equipamento NOVO do ano corrente não deprecia', () => {
    const eq = criarEquipamento({ tipo: TipoEquipamento.SERVIDOR, anoFabricacao: 2026, estadoFisico: EstadoFisico.NOVO });
    const r = eq.calcularDepreciacao(0.15, 2026);
    expect(r.valorAtual).toBe(15000);
    expect(r.percentualDepreciacao).toBe(0);
  });

  it('a depreciação por idade é limitada a 90% (equipamento de 20 anos)', () => {
    const eq = criarEquipamento({ tipo: TipoEquipamento.SERVIDOR, anoFabricacao: 2006, estadoFisico: EstadoFisico.NOVO });
    const r = eq.calcularDepreciacao(0.15, 2026);
    // 20 × 0,15 = 3,0 → limitado a 0,90 → 15000 × 0,10 × 1,00
    expect(r.valorAtual).toBe(1500);
    expect(r.percentualDepreciacao).toBe(90);
  });

  it('ano de fabricação "no futuro" em relação ao ano de cálculo usa idade 0', () => {
    const eq = criarEquipamento({ anoFabricacao: 2026, estadoFisico: EstadoFisico.NOVO });
    expect(eq.calcularDepreciacao(0.15, 2025).idade).toBe(0);
  });

  it('INSERVIVEL antigo combina teto de idade e fator 0,05 → 99,5%', () => {
    const eq = criarEquipamento({ tipo: TipoEquipamento.MONITOR, anoFabricacao: 2010, estadoFisico: EstadoFisico.INSERVIVEL });
    const r = eq.calcularDepreciacao(0.15, 2026);
    // 1200 × 0,10 × 0,05 = 6
    expect(r.valorAtual).toBe(6);
    expect(r.percentualDepreciacao).toBe(99.5);
  });

  it('respeita o coeficiente global configurado pelo Administrador', () => {
    const eq = criarEquipamento({ anoFabricacao: 2024, estadoFisico: EstadoFisico.NOVO });
    // 2 anos × 0,20 = 0,40 → 4500 × 0,60
    expect(eq.calcularDepreciacao(0.2, 2026).valorAtual).toBe(2700);
  });

  it('bônus de metal nobre = peso × teor × R$ 2.500/kg', () => {
    const servidor = criarEquipamento({ tipo: TipoEquipamento.SERVIDOR, pesoQuilogramas: 20 });
    // 20 kg × 0,003 × 2500 = 150
    expect(servidor.calcularBonusMetalNobre()).toBe(150);
    const cabo = criarEquipamento({ tipo: TipoEquipamento.CABO_ESTRUTURADO, pesoQuilogramas: 5 });
    expect(cabo.calcularBonusMetalNobre()).toBe(0);
  });
});
