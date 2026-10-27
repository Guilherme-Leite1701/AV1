import { describe, expect, it } from 'vitest';
import { Equipamento } from '../../src/domain/entidades/Equipamento';
import { EstadoFisico, indiceEstadoFisico } from '../../src/domain/enums/EstadoFisico';
import { StatusLote } from '../../src/domain/enums/StatusLote';
import { StatusRastreamento } from '../../src/domain/enums/StatusRastreamento';
import { TipoEquipamento } from '../../src/domain/enums/TipoEquipamento';
import { ErroRegraNegocio } from '../../src/domain/erros/ErrosAplicacao';
import { criarEquipamento } from './fabricas';

describe('Escala de degradação do EstadoFisico', () => {
  it('segue a ordem 0 = NOVO ... 6 = INSERVIVEL', () => {
    expect(indiceEstadoFisico(EstadoFisico.NOVO)).toBe(0);
    expect(indiceEstadoFisico(EstadoFisico.USADO_MODERADO)).toBe(3);
    expect(indiceEstadoFisico(EstadoFisico.INSERVIVEL)).toBe(6);
  });
});

describe('Regra de Queda Brusca (alterarEstadoFisico)', () => {
  it('queda de 1 nível dispensa justificativa', () => {
    const eq = criarEquipamento({ estadoFisico: EstadoFisico.BOM_ESTADO });
    const r = eq.alterarEstadoFisico(EstadoFisico.USADO_LEVE);
    expect(r).toEqual({ anterior: EstadoFisico.BOM_ESTADO, novo: EstadoFisico.USADO_LEVE, queda: 1 });
  });

  it('melhora de estado (queda negativa) dispensa justificativa', () => {
    const eq = criarEquipamento({ estadoFisico: EstadoFisico.DANIFICADO_GRAVE });
    expect(eq.alterarEstadoFisico(EstadoFisico.USADO_LEVE).queda).toBe(-3);
  });

  it('queda de 2 níveis SEM justificativa lança ErroRegraNegocio (422)', () => {
    const eq = criarEquipamento({ estadoFisico: EstadoFisico.BOM_ESTADO });
    const tentar = () => eq.alterarEstadoFisico(EstadoFisico.USADO_MODERADO);
    expect(tentar).toThrow(ErroRegraNegocio);
    expect(tentar).toThrow(/Queda brusca de 2 níveis/);
    try {
      tentar();
    } catch (erro) {
      expect((erro as ErroRegraNegocio).statusCode).toBe(422);
    }
    expect(eq.estadoFisico).toBe(EstadoFisico.BOM_ESTADO);
  });

  it('queda de 2+ níveis com justificativa curta (< 15 caracteres) é recusada', () => {
    const eq = criarEquipamento({ estadoFisico: EstadoFisico.NOVO });
    expect(() => eq.alterarEstadoFisico(EstadoFisico.INSERVIVEL, 'caiu no chão')).toThrow(ErroRegraNegocio);
    expect(() => eq.alterarEstadoFisico(EstadoFisico.INSERVIVEL, '              ok         ')).toThrow(ErroRegraNegocio);
  });

  it('queda de 6 níveis com justificativa de 15+ caracteres é aceita', () => {
    const eq = criarEquipamento({ estadoFisico: EstadoFisico.NOVO });
    const r = eq.alterarEstadoFisico(EstadoFisico.INSERVIVEL, 'Placa-mãe queimada após curto');
    expect(r.queda).toBe(6);
    expect(eq.estadoFisico).toBe(EstadoFisico.INSERVIVEL);
  });

  it('não aceita "mudar" para o mesmo estado', () => {
    expect(() => criarEquipamento().alterarEstadoFisico(EstadoFisico.BOM_ESTADO)).toThrow(/já está/);
  });
});

describe('Regra de Triagem Obrigatória (atualizarStatus)', () => {
  it('EM_TRIAGEM → AGUARDANDO_DESMONTE é permitido mesmo com o lote ainda EM_TRIAGEM', () => {
    const eq = criarEquipamento({ statusRastreamento: StatusRastreamento.EM_TRIAGEM });
    expect(eq.atualizarStatus(StatusRastreamento.AGUARDANDO_DESMONTE, StatusLote.EM_TRIAGEM).novo).toBe(
      StatusRastreamento.AGUARDANDO_DESMONTE,
    );
  });

  it('AGUARDANDO_DESMONTE → EM_DESMONTE é permitido', () => {
    const eq = criarEquipamento({ statusRastreamento: StatusRastreamento.AGUARDANDO_DESMONTE });
    expect(() => eq.atualizarStatus(StatusRastreamento.EM_DESMONTE, StatusLote.EM_TRIAGEM)).not.toThrow();
  });

  it('vindo de outro status, desmonte só com lote TRIAGEM_CONCLUIDA', () => {
    const eq = criarEquipamento({ statusRastreamento: StatusRastreamento.MATERIAL_RECICLAVEL });
    expect(() => eq.atualizarStatus(StatusRastreamento.EM_DESMONTE, StatusLote.EM_TRIAGEM)).toThrow(/Triagem obrigatória/);
    expect(() => eq.atualizarStatus(StatusRastreamento.EM_DESMONTE, StatusLote.TRIAGEM_CONCLUIDA)).not.toThrow();
  });

  it('equipamento AGUARDANDO_TRIAGEM só sai pela triagem do lote', () => {
    const eq = criarEquipamento({ statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM });
    expect(() => eq.atualizarStatus(StatusRastreamento.DESCARTE_SEGURO, StatusLote.RECEBIDO)).toThrow(/aguarda triagem/);
    expect(eq.iniciarTriagem().novo).toBe(StatusRastreamento.EM_TRIAGEM);
  });

  it('BAIXA_DEFINITIVA é terminal', () => {
    const eq = criarEquipamento({ statusRastreamento: StatusRastreamento.BAIXA_DEFINITIVA });
    expect(() => eq.atualizarStatus(StatusRastreamento.EM_TRIAGEM, StatusLote.FINALIZADO)).toThrow(/BAIXA_DEFINITIVA/);
    expect(() => eq.alterarEstadoFisico(EstadoFisico.NOVO)).toThrow(/BAIXA_DEFINITIVA/);
  });
});

describe('Equipamento.validarNovo()', () => {
  const base = {
    tipo: TipoEquipamento.MONITOR,
    marca: 'LG',
    modelo: '24MK430H',
    anoFabricacao: 2020,
    estadoFisico: EstadoFisico.USADO_LEVE,
    pesoQuilogramas: 3.2,
  };

  it('aceita dados válidos', () => {
    expect(() => Equipamento.validarNovo(base, 2026)).not.toThrow();
  });

  it('recusa peso zero ou negativo', () => {
    expect(() => Equipamento.validarNovo({ ...base, pesoQuilogramas: 0 }, 2026)).toThrow(/peso/);
  });

  it('recusa ano de fabricação no futuro', () => {
    expect(() => Equipamento.validarNovo({ ...base, anoFabricacao: 2027 }, 2026)).toThrow(/Ano de fabricação/);
  });
});
