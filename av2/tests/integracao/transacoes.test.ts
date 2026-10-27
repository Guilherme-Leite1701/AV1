import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AmbienteTeste } from './ambiente';

let amb: AmbienteTeste;

beforeAll(async () => {
  amb = await AmbienteTeste.criar();
});

afterAll(async () => {
  await amb.encerrar();
});

const equipamento = (sobrescrever: Record<string, unknown> = {}) => ({
  tipo: 'SERVIDOR',
  marca: 'Dell',
  modelo: 'PowerEdge R640',
  anoFabricacao: 2020,
  estadoFisico: 'BOM_ESTADO',
  pesoQuilogramas: 21.5,
  ...sobrescrever,
});

describe('Rollback de transação: lote com item inválido', () => {
  it('se o 3º de 3 equipamentos for inválido, NENHUM é gravado (nem o contador de código de barras avança)', async () => {
    const org = await amb.criarOrganizacao();
    const lote = await amb.criarLote(org.id);
    const contadorAntes = await amb.prisma.contadorSequencial.findMany();
    const journalAntes = await amb.prisma.journalTransacao.count({ where: { entidade: 'Equipamento' } });

    const r = await amb.requisicao('gestor', {
      method: 'POST',
      url: `/lotes/${lote.id}/equipamentos`,
      payload: {
        equipamentos: [
          equipamento(),
          equipamento({ tipo: 'NOTEBOOK', pesoQuilogramas: 1.8 }),
          equipamento({ anoFabricacao: new Date().getFullYear() + 1 }),
        ],
      },
    });

    expect(r.statusCode).toBe(422);
    expect(r.json().mensagem).toMatch(/Equipamento #3/);
    expect(await amb.prisma.equipamento.count({ where: { loteId: lote.id } })).toBe(0);
    expect(await amb.prisma.movimentacao.count({ where: { equipamento: { loteId: lote.id } } })).toBe(0);
    expect(await amb.prisma.journalTransacao.count({ where: { entidade: 'Equipamento' } })).toBe(journalAntes);
    expect(await amb.prisma.contadorSequencial.findMany()).toEqual(contadorAntes);

    // Corrigida, a carga entra inteira e sem buracos na sequência.
    const ok = await amb.requisicao('gestor', {
      method: 'POST',
      url: `/lotes/${lote.id}/equipamentos`,
      payload: { equipamentos: [equipamento(), equipamento({ tipo: 'NOTEBOOK', pesoQuilogramas: 1.8 })] },
    });
    expect(ok.statusCode).toBe(201);
    const [primeiro, segundo] = ok.json();
    const ano = new Date().getFullYear();
    expect(primeiro.codigoBarrasInterno).toMatch(new RegExp(`^GC-SRV-${ano}-\\d{6}$`));
    expect(Number(segundo.codigoBarrasInterno.slice(-6))).toBe(Number(primeiro.codigoBarrasInterno.slice(-6)) + 1);
    expect(segundo.posicaoNoLote).toBe(2);
  });

  it('peso <= 0 é barrado já no JSON Schema (400) e o CHECK do banco barra gravações diretas', async () => {
    const org = await amb.criarOrganizacao();
    const lote = await amb.criarLote(org.id);
    const r = await amb.requisicao('gestor', {
      method: 'POST',
      url: `/lotes/${lote.id}/equipamentos`,
      payload: { equipamentos: [equipamento({ pesoQuilogramas: 0 })] },
    });
    expect(r.statusCode).toBe(400);

    // Gravação direta no banco: barrada pelo CHECK.
    await expect(
      amb.prisma.equipamento.create({
        data: { ...equipamento({ pesoQuilogramas: -1 }), codigoBarrasInterno: 'GC-X', loteId: lote.id, posicaoNoLote: 99 } as never,
      }),
    ).rejects.toThrow(/check constraint|Equipamento_pesoQuilogramas_positivo_check/i);
  });

  it('o CHECK "valorMensal" >= 0 também protege o contrato', async () => {
    const org = await amb.criarOrganizacao();
    await expect(amb.prisma.contrato.update({ where: { organizacaoId: org.id }, data: { valorMensal: -10 } })).rejects.toThrow(
      /check constraint|Contrato_valorMensal_nao_negativo_check/i,
    );
  });
});

describe('Regra de contrato no recebimento de lote', () => {
  it('contrato vencido COM renovação automática: renova +12 meses e registra no journal', async () => {
    const org = await amb.criarOrganizacao({ renovacaoAutomatica: true });
    await amb.vencerContrato(org.id);

    const r = await amb.requisicao('gestor', {
      method: 'POST',
      url: '/lotes',
      payload: { organizacaoId: org.id, notaFiscal: amb.novaNotaFiscal(), transportadora: 'T' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().contratoRenovado).not.toBeNull();

    const contrato = await amb.prisma.contrato.findUniqueOrThrow({ where: { organizacaoId: org.id } });
    expect(contrato.dataVencimento.getTime()).toBeGreaterThan(Date.now() + 360 * 24 * 60 * 60 * 1000);
    expect(contrato.versao).toBe(2);

    const journal = await amb.prisma.journalTransacao.findFirst({
      where: { operacao: 'RENOVACAO_AUTOMATICA', dadosDepois: { path: ['organizacaoId'], equals: org.id } },
    });
    expect(journal).not.toBeNull();
    expect(journal?.usuarioResponsavel).toBe('gestor');
  });

  it('contrato vencido SEM renovação automática: 422 e nenhum lote criado', async () => {
    const org = await amb.criarOrganizacao({ renovacaoAutomatica: false });
    await amb.vencerContrato(org.id);
    const r = await amb.requisicao('gestor', {
      method: 'POST',
      url: '/lotes',
      payload: { organizacaoId: org.id, notaFiscal: amb.novaNotaFiscal(), transportadora: 'T' },
    });
    expect(r.statusCode).toBe(422);
    expect(await amb.prisma.lote.count({ where: { organizacaoId: org.id } })).toBe(0);
  });

  it('se o lote falhar DEPOIS da renovação automática (NF duplicada), a renovação também é desfeita', async () => {
    const org = await amb.criarOrganizacao({ renovacaoAutomatica: true });
    const loteExistente = await amb.criarLote(org.id);
    await amb.vencerContrato(org.id);
    const antes = await amb.prisma.contrato.findUniqueOrThrow({ where: { organizacaoId: org.id } });

    const r = await amb.requisicao('gestor', {
      method: 'POST',
      url: '/lotes',
      payload: { organizacaoId: org.id, notaFiscal: loteExistente.notaFiscal, transportadora: 'T' },
    });
    expect(r.statusCode).toBe(409);

    const depois = await amb.prisma.contrato.findUniqueOrThrow({ where: { organizacaoId: org.id } });
    expect(depois.dataVencimento).toEqual(antes.dataVencimento);
    expect(depois.versao).toBe(antes.versao);
    expect(
      await amb.prisma.journalTransacao.count({ where: { operacao: 'RENOVACAO_AUTOMATICA', dadosDepois: { path: ['organizacaoId'], equals: org.id } } }),
    ).toBe(0);
  });

  it('data de entrada fora da janela de 90 dias → 422', async () => {
    const org = await amb.criarOrganizacao();
    const r = await amb.requisicao('gestor', {
      method: 'POST',
      url: '/lotes',
      payload: {
        organizacaoId: org.id,
        notaFiscal: amb.novaNotaFiscal(),
        transportadora: 'T',
        dataEntrada: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().mensagem).toMatch(/90 dias/);
  });
});

describe('Cadastro de organização + contrato (transação única)', () => {
  it('CNPJ inválido → 400; CNPJ duplicado → 409 sem criar nada', async () => {
    const base = await amb.criarOrganizacao();
    const total = await amb.prisma.organizacao.count();

    const invalido = await amb.requisicao('operador', {
      method: 'POST',
      url: '/organizacoes',
      payload: {
        razaoSocial: 'CNPJ Errado',
        cnpj: '11.222.333/0001-82',
        enderecoCompleto: 'Rua A, 1',
        contrato: { dataAssinatura: '2026-01-01', dataVencimento: '2027-01-01', valorMensal: 10 },
      },
    });
    expect(invalido.statusCode).toBe(400);

    const duplicado = await amb.requisicao('operador', {
      method: 'POST',
      url: '/organizacoes',
      payload: {
        razaoSocial: 'Duplicada',
        cnpj: base.cnpj,
        enderecoCompleto: 'Rua A, 1',
        contrato: { dataAssinatura: '2026-01-01', dataVencimento: '2027-01-01', valorMensal: 10 },
      },
    });
    expect(duplicado.statusCode).toBe(409);
    expect(await amb.prisma.organizacao.count()).toBe(total);
    expect(await amb.prisma.contrato.count()).toBe(total);
  });
});
