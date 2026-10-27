import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AmbienteTeste } from './ambiente';

let amb: AmbienteTeste;

beforeAll(async () => {
  amb = await AmbienteTeste.criar();
});

afterAll(async () => {
  await amb.encerrar();
});

describe('Jornada: RECEBIDO → EM_TRIAGEM → TRIAGEM_CONCLUIDA → ENCAMINHADO → FINALIZADO', () => {
  it('percorre o fluxo inteiro e gera relatórios coerentes', async () => {
    const org = await amb.criarOrganizacao();
    let lote = await amb.criarLote(org.id);
    const [notebook, monitor] = await amb.adicionarEquipamentos(lote.id, 2);

    const removido = await amb.requisicao('gestor', { method: 'DELETE', url: `/lotes/${lote.id}/equipamentos/${monitor.id}?versao=${monitor.versao}` });
    expect(removido.statusCode).toBe(204);
    const [monitor2] = (await amb.adicionarEquipamentos(lote.id, 2)).slice(1);

    const precoce = await amb.requisicao('gestor', { method: 'PATCH', url: `/equipamentos/${notebook.id}/status`, payload: { status: 'DESCARTE_SEGURO', versao: notebook.versao } });
    expect(precoce.statusCode).toBe(422);

    let r = await amb.requisicao('gestor', { method: 'POST', url: `/lotes/${lote.id}/triagem`, payload: { versao: lote.versao } });
    expect(r.statusCode).toBe(200);
    lote = r.json().lote;
    expect(lote.statusProcessamento).toBe('EM_TRIAGEM');
    expect(r.json().equipamentosAtualizados).toHaveLength(3);

    r = await amb.requisicao('gestor', {
      method: 'POST',
      url: `/lotes/${lote.id}/equipamentos`,
      payload: { equipamentos: [{ tipo: 'ROTEADOR', marca: 'X', modelo: 'Y', anoFabricacao: 2020, estadoFisico: 'NOVO', pesoQuilogramas: 1 }] },
    });
    expect(r.statusCode).toBe(422);

    r = await amb.requisicao('gestor', { method: 'POST', url: `/lotes/${lote.id}/triagem`, payload: { versao: lote.versao } });
    lote = r.json().lote;
    expect(lote.statusProcessamento).toBe('TRIAGEM_CONCLUIDA');

    // O 1º destino leva o lote a ENCAMINHADO; o último, a FINALIZADO.
    const equipamentos = await amb.prisma.equipamento.findMany({ where: { loteId: lote.id }, orderBy: { posicaoNoLote: 'asc' } });
    const destinos = ['PECAS_REAPROVEITADAS', 'MATERIAL_RECICLAVEL', 'DESCARTE_SEGURO'];
    for (const [i, eq] of equipamentos.entries()) {
      r = await amb.requisicao('gestor', {
        method: 'PATCH',
        url: `/equipamentos/${eq.codigoBarrasInterno}/status`,
        payload: { status: destinos[i], versao: eq.versao, destino: `Destino ${i + 1}` },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().lote.statusProcessamento).toBe(i < equipamentos.length - 1 ? 'ENCAMINHADO' : 'FINALIZADO');
    }

    r = await amb.requisicao('auditor', { method: 'GET', url: `/equipamentos/${notebook.id}/rastreamento` });
    expect(r.statusCode).toBe(200);
    const rastreio = r.json();
    expect(rastreio.organizacao.id).toBe(org.id);
    expect(rastreio.movimentacoes.map((m: { destino: string }) => m.destino)).toEqual(['Almoxarifado', 'Área de triagem', 'Destino 1']);
    expect(rastreio.localAtual).toBe('Destino 1');
    expect(rastreio.valoracao.valorAtual).toBeGreaterThan(0);

    r = await amb.requisicao('gestor', { method: 'POST', url: `/equipamentos/${monitor2.id}/movimentacoes`, payload: { destino: 'Galpão B', observacao: 'Reorganização' } });
    expect(r.statusCode).toBe(201);

    r = await amb.requisicao('auditor', { method: 'GET', url: `/lotes/${lote.id}/relatorio-triagem` });
    expect(r.json()).toMatchObject({ totalEquipamentos: 3, pesoTotalKg: 7.5 });

    r = await amb.requisicao('auditor', { method: 'GET', url: `/relatorios/organizacao/${org.id}` });
    expect(r.json()).toMatchObject({ totalLotes: 1, totalEquipamentos: 3, pesoTotalProcessadoKg: 7.5, lotesPorStatus: { FINALIZADO: 1 } });

    r = await amb.requisicao('auditor', { method: 'GET', url: '/relatorios/status/DESCARTE_SEGURO' });
    expect(r.json().quantidade).toBeGreaterThanOrEqual(1);

    r = await amb.requisicao('auditor', { method: 'GET', url: '/relatorios/financeiro' });
    const financeiro = r.json();
    expect(r.statusCode).toBe(200);
    expect(financeiro.custoDescarte).toBeCloseTo(2.5 * financeiro.parametros.CUSTO_DESCARTE_POR_KG, 2);
    expect(financeiro.resultadoLiquido).toBeCloseTo(
      financeiro.receitaContratos + financeiro.valorRecuperado - financeiro.custoDescarte - financeiro.impostos,
      1,
    );
    expect(financeiro.impostos).toBeCloseTo(financeiro.receitaBruta * financeiro.parametros.ALIQUOTA_IMPOSTO_PADRAO, 1);

    r = await amb.requisicao('auditor', { method: 'GET', url: '/journal?entidade=Lote&limite=100' });
    const operacoes = r.json().map((j: { operacao: string }) => j.operacao);
    expect(operacoes).toEqual(expect.arrayContaining(['CRIAR', 'TRIAGEM', 'ATUALIZAR']));
  });
});
