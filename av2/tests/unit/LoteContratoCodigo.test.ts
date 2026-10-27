import { describe, expect, it } from 'vitest';
import { Contrato, PropsContrato } from '../../src/domain/entidades/Contrato';
import { GeradorCodigoBarras } from '../../src/domain/entidades/GeradorCodigoBarras';
import { Lote } from '../../src/domain/entidades/Lote';
import { StatusLote } from '../../src/domain/enums/StatusLote';
import { StatusRastreamento as S } from '../../src/domain/enums/StatusRastreamento';
import { TipoEquipamento } from '../../src/domain/enums/TipoEquipamento';
import { ErroRegraNegocio, ErroValidacao } from '../../src/domain/erros/ErrosAplicacao';

describe('GeradorCodigoBarras', () => {
  it('gera GC-{PREFIXO}-{ANO}-{SEQ 6 dígitos}', () => {
    expect(GeradorCodigoBarras.gerarCodigoBarras(TipoEquipamento.NOTEBOOK, 2026, 1)).toBe('GC-NBK-2026-000001');
    expect(GeradorCodigoBarras.gerarCodigoBarras(TipoEquipamento.SERVIDOR, 2026, 4321)).toBe('GC-SRV-2026-004321');
  });

  it('recusa sequência fora de 1..999999', () => {
    expect(() => GeradorCodigoBarras.gerarCodigoBarras(TipoEquipamento.MONITOR, 2026, 0)).toThrow(ErroValidacao);
    expect(() => GeradorCodigoBarras.gerarCodigoBarras(TipoEquipamento.MONITOR, 2026, 1_000_000)).toThrow(ErroValidacao);
  });
});

describe('Contrato: recebimento de lote', () => {
  const agora = new Date('2026-10-26T12:00:00Z');
  const props = (p: Partial<PropsContrato>): PropsContrato => ({
    id: 'c1',
    organizacaoId: 'o1',
    dataAssinatura: new Date('2025-01-01T00:00:00Z'),
    dataVencimento: new Date('2026-12-31T00:00:00Z'),
    clausulas: [],
    valorMensal: 1000,
    renovacaoAutomatica: false,
    versao: 1,
    ...p,
  });

  it('contrato vigente libera sem renovar', () => {
    expect(new Contrato(props({})).avaliarRecebimentoDeLote(agora)).toEqual({ renovado: false });
  });

  it('vencido COM renovação automática renova por +12 meses', () => {
    const contrato = new Contrato(props({ dataVencimento: new Date('2026-10-20T00:00:00Z'), renovacaoAutomatica: true }));
    const r = contrato.avaliarRecebimentoDeLote(agora);
    expect(r.renovado).toBe(true);
    expect(contrato.dataVencimento.getFullYear()).toBe(2027);
    expect(contrato.estaVigente(agora)).toBe(true);
  });

  it('vencido SEM renovação automática bloqueia com 422', () => {
    const contrato = new Contrato(props({ dataVencimento: new Date('2026-10-20T00:00:00Z') }));
    expect(() => contrato.avaliarRecebimentoDeLote(agora)).toThrow(ErroRegraNegocio);
  });

  it('não aceita vencimento antes da assinatura nem valor negativo', () => {
    expect(() => new Contrato(props({ dataVencimento: new Date('2024-01-01') }))).toThrow(ErroValidacao);
    expect(() => new Contrato(props({ valorMensal: -1 }))).toThrow(ErroValidacao);
  });

  it('calcula os meses vigentes dentro de um período', () => {
    const contrato = new Contrato(props({ dataAssinatura: new Date('2026-07-01T00:00:00Z') }));
    const meses = contrato.mesesVigentesNoPeriodo(new Date('2026-01-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'));
    expect(meses).toBeCloseTo(3, 0);
  });
});

describe('Lote: fluxo de status', () => {
  const lote = (status: StatusLote) =>
    new Lote({
      id: 'l1',
      dataEntrada: new Date(),
      organizacaoId: 'o1',
      notaFiscal: 'NF-1',
      transportadora: 'T',
      statusProcessamento: status,
      observacoes: '',
      versao: 1,
    });

  it('avança RECEBIDO → EM_TRIAGEM → TRIAGEM_CONCLUIDA', () => {
    const l = lote(StatusLote.RECEBIDO);
    expect(l.avancarTriagem(3).novo).toBe(StatusLote.EM_TRIAGEM);
    expect(l.avancarTriagem(3).novo).toBe(StatusLote.TRIAGEM_CONCLUIDA);
    expect(() => l.avancarTriagem(3)).toThrow(ErroRegraNegocio);
  });

  it('não inicia triagem de lote vazio', () => {
    expect(() => lote(StatusLote.RECEBIDO).avancarTriagem(0)).toThrow(/não possui equipamentos/);
  });

  it('deriva ENCAMINHADO e FINALIZADO a partir dos equipamentos', () => {
    expect(Lote.statusDerivado(StatusLote.TRIAGEM_CONCLUIDA, [S.EM_TRIAGEM, S.EM_TRIAGEM])).toBe(StatusLote.TRIAGEM_CONCLUIDA);
    expect(Lote.statusDerivado(StatusLote.TRIAGEM_CONCLUIDA, [S.EM_TRIAGEM, S.EM_DESMONTE])).toBe(StatusLote.ENCAMINHADO);
    expect(Lote.statusDerivado(StatusLote.ENCAMINHADO, [S.DESCARTE_SEGURO, S.MATERIAL_RECICLAVEL])).toBe(StatusLote.FINALIZADO);
    expect(Lote.statusDerivado(StatusLote.EM_TRIAGEM, [S.DESCARTE_SEGURO])).toBe(StatusLote.EM_TRIAGEM);
  });

  it('só aceita equipamentos enquanto RECEBIDO', () => {
    expect(() => lote(StatusLote.RECEBIDO).garantirAbertoParaEquipamentos()).not.toThrow();
    expect(() => lote(StatusLote.EM_TRIAGEM).garantirAbertoParaEquipamentos()).toThrow(ErroRegraNegocio);
  });
});
