import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AmbienteTeste } from './ambiente';

let amb: AmbienteTeste;

beforeAll(async () => {
  amb = await AmbienteTeste.criar();
});

afterAll(async () => {
  await amb.encerrar();
});

async function prepararEquipamentoEmTriagem() {
  const org = await amb.criarOrganizacao();
  const lote = await amb.criarLote(org.id);
  const [equipamento] = await amb.adicionarEquipamentos(lote.id, 2);
  const triagem = await amb.requisicao('gestor', { method: 'POST', url: `/lotes/${lote.id}/triagem`, payload: { versao: lote.versao } });
  expect(triagem.statusCode).toBe(200);
  const atual = await amb.prisma.equipamento.findUniqueOrThrow({ where: { id: equipamento.id } });
  return { org, lote: triagem.json().lote, equipamento: atual };
}

describe('Versionamento otimista (optimistic locking) → 409 Conflict', () => {
  it('versão desatualizada é recusada com 409 e não altera nada', async () => {
    const { equipamento } = await prepararEquipamentoEmTriagem();
    const url = `/equipamentos/${equipamento.id}/estado-fisico`;

    const primeira = await amb.requisicao('gestor', { method: 'PATCH', url, payload: { estadoFisico: 'USADO_LEVE', versao: equipamento.versao, justificativa: 'Desgaste visível na carcaça' } });
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json().equipamento.versao).toBe(equipamento.versao + 1);

    // Outro usuário ainda com a versão antiga:
    const segunda = await amb.requisicao('gestor', { method: 'PATCH', url, payload: { estadoFisico: 'NOVO', versao: equipamento.versao } });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe('ConflitoConcorrenciaError');

    const banco = await amb.prisma.equipamento.findUniqueOrThrow({ where: { id: equipamento.id } });
    expect(banco.estadoFisico).toBe('USADO_LEVE');
    expect(banco.versao).toBe(equipamento.versao + 1);
  });

  it('duas requisições SIMULTÂNEAS com a mesma versão: exatamente uma vence (200) e a outra recebe 409', async () => {
    const { equipamento } = await prepararEquipamentoEmTriagem();
    const movimentacoesAntes = await amb.prisma.movimentacao.count({ where: { equipamentoId: equipamento.id } });
    const url = `/equipamentos/${equipamento.id}/status`;

    const [a, b] = await Promise.all([
      amb.requisicao('gestor', { method: 'PATCH', url, payload: { status: 'AGUARDANDO_DESMONTE', versao: equipamento.versao, destino: 'Bancada 1' } }),
      amb.requisicao('admin', { method: 'PATCH', url, payload: { status: 'DESCARTE_SEGURO', versao: equipamento.versao, destino: 'Aterro Classe I' } }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const banco = await amb.prisma.equipamento.findUniqueOrThrow({ where: { id: equipamento.id } });
    expect(banco.versao).toBe(equipamento.versao + 1);
    // A perdedora sofreu rollback.
    expect(await amb.prisma.movimentacao.count({ where: { equipamentoId: equipamento.id } })).toBe(movimentacoesAntes + 1);
  });

  it('triagem com versão de lote desatualizada → 409 e os equipamentos NÃO mudam (atomicidade)', async () => {
    const org = await amb.criarOrganizacao();
    const lote = await amb.criarLote(org.id);
    await amb.adicionarEquipamentos(lote.id, 3);

    const r = await amb.requisicao('gestor', { method: 'POST', url: `/lotes/${lote.id}/triagem`, payload: { versao: lote.versao + 5 } });
    expect(r.statusCode).toBe(409);
    const status = await amb.prisma.equipamento.findMany({ where: { loteId: lote.id }, select: { statusRastreamento: true } });
    expect(status.every((e) => e.statusRastreamento === 'AGUARDANDO_TRIAGEM')).toBe(true);
  });

  it('organização: endereço e desativação também exigem a versão atual', async () => {
    const org = await amb.criarOrganizacao();
    const ok = await amb.requisicao('operador', {
      method: 'PATCH',
      url: `/organizacoes/${org.id}/endereco`,
      payload: { enderecoCompleto: 'Av. Nova, 500 - Centro', versao: org.versao },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().versao).toBe(org.versao + 1);

    const velho = await amb.requisicao('operador', { method: 'DELETE', url: `/organizacoes/${org.id}?versao=${org.versao}` });
    expect(velho.statusCode).toBe(409);

    const desativada = await amb.requisicao('operador', { method: 'DELETE', url: `/organizacoes/${org.id}?versao=${org.versao + 1}` });
    expect(desativada.statusCode).toBe(200);
    expect(desativada.json().ativo).toBe(false);
  });

  it('id inexistente → 404 (e não 409)', async () => {
    const r = await amb.requisicao('gestor', {
      method: 'PATCH',
      url: '/equipamentos/00000000-0000-0000-0000-000000000000/estado-fisico',
      payload: { estadoFisico: 'NOVO', versao: 1 },
    });
    expect(r.statusCode).toBe(404);
  });
});
