import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AmbienteTeste, Papel } from './ambiente';

let amb: AmbienteTeste;
let orgId: string;
let loteId: string;
let equipId: string;

beforeAll(async () => {
  amb = await AmbienteTeste.criar();
  orgId = (await amb.criarOrganizacao()).id;
  loteId = (await amb.criarLote(orgId)).id;
  equipId = (await amb.adicionarEquipamentos(loteId, 1))[0].id;
});

afterAll(async () => {
  await amb.encerrar();
});

describe('Autenticação JWT', () => {
  it('rota protegida sem token → 401', async () => {
    const r = await amb.app.inject({ method: 'GET', url: '/lotes' });
    expect(r.statusCode).toBe(401);
    expect(r.json().erro).toBe('ErroNaoAutenticado');
  });

  it('token adulterado → 401', async () => {
    const r = await amb.app.inject({ method: 'GET', url: '/lotes', headers: { authorization: `Bearer ${amb.tokens.admin}x` } });
    expect(r.statusCode).toBe(401);
  });

  it('login com senha errada → 401 com mensagem genérica', async () => {
    const r = await amb.app.inject({ method: 'POST', url: '/auth/login', payload: { usuario: 'admin', senha: 'errada123' } });
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toBe('Usuário ou senha inválidos.');
  });

  it('o token emitido no login expira em 30 minutos e carrega { id, usuario, papel }', async () => {
    const payload = amb.app.jwt.decode<{ id: string; usuario: string; papel: string; iat: number; exp: number }>(amb.tokens.auditor);
    expect(payload?.exp! - payload?.iat!).toBe(30 * 60);
    expect(payload).toMatchObject({ usuario: 'auditor', papel: 'AUDITOR' });
    expect(payload?.id).toBeTypeOf('string');
  });

  it('token expirado → 401 "Token expirado"', async () => {
    const curto = amb.app.jwt.sign({ id: 'x', usuario: 'admin', papel: 'ADMINISTRADOR' as never }, { expiresIn: '1s' });
    await new Promise((resolver) => setTimeout(resolver, 2100));
    const r = await amb.app.inject({ method: 'GET', url: '/organizacoes', headers: { authorization: `Bearer ${curto}` } });
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toMatch(/expirado/);
  });
});

describe('RBAC: AUDITOR é somente leitura', () => {
  it.each([
    '/organizacoes',
    () => `/organizacoes/${orgId}`,
    '/lotes',
    () => `/lotes/${loteId}/relatorio-triagem`,
    () => `/equipamentos/${equipId}/rastreamento`,
    '/relatorios/financeiro',
    '/relatorios/status/AGUARDANDO_TRIAGEM',
    () => `/relatorios/organizacao/${orgId}`,
    '/journal',
  ])('GET %s → 200', async (url) => {
    const r = await amb.requisicao('auditor', { method: 'GET', url: typeof url === 'function' ? url() : url });
    expect(r.statusCode).toBe(200);
  });

  type Escrita = ['POST' | 'PATCH' | 'DELETE', () => string, object | undefined];
  const escritas: Escrita[] = [
    ['POST', () => '/organizacoes', { razaoSocial: 'X', cnpj: '11222333000181', enderecoCompleto: 'Rua X, 1', contrato: {} }],
    ['PATCH', () => `/organizacoes/${orgId}/endereco`, { enderecoCompleto: 'Rua Nova, 2', versao: 1 }],
    ['DELETE', () => `/organizacoes/${orgId}?versao=1`, undefined],
    ['PATCH', () => `/organizacoes/${orgId}/contrato/renovar`, { versao: 1 }],
    ['POST', () => '/lotes', { organizacaoId: orgId, notaFiscal: 'NF-AUD', transportadora: 'T' }],
    ['POST', () => `/lotes/${loteId}/equipamentos`, { equipamentos: [] }],
    ['POST', () => `/lotes/${loteId}/triagem`, { versao: 1 }],
    ['DELETE', () => `/lotes/${loteId}/equipamentos/${equipId}?versao=1`, undefined],
    ['PATCH', () => `/equipamentos/${equipId}/estado-fisico`, { estadoFisico: 'NOVO', versao: 1 }],
    ['PATCH', () => `/equipamentos/${equipId}/status`, { status: 'EM_TRIAGEM', versao: 1 }],
    ['POST', () => `/equipamentos/${equipId}/movimentacoes`, { destino: 'Galpão 2' }],
    ['POST', () => '/usuarios', { usuario: 'novo', senha: 'Senha@1234', papel: 'AUDITOR' }],
    ['PATCH', () => '/parametros/ALIQUOTA_IMPOSTO_PADRAO', { valorNumerico: 0.5 }],
  ];

  it.each(escritas)('%s %s → 403', async (metodo, url, payload) => {
    const r = await amb.requisicao('auditor', { method: metodo, url: url(), payload });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe('ErroAcessoNegado');
  });

  it('o 403 acontece ANTES de qualquer efeito: o lote continua com o mesmo número de equipamentos', async () => {
    const r = await amb.requisicao('auditor', { method: 'GET', url: `/lotes/${loteId}` });
    expect(r.json().equipamentos).toHaveLength(1);
  });
});

describe('RBAC: matriz dos demais papéis', () => {
  const casos: [Papel, string, () => string, number][] = [
    ['operador', 'POST', () => '/lotes', 403],
    ['operador', 'GET', () => '/lotes', 403],
    ['gestor', 'POST', () => '/organizacoes', 403],
    ['gestor', 'GET', () => '/organizacoes', 200],
    ['gestor', 'GET', () => '/relatorios/financeiro', 403],
    ['gestor', 'GET', () => '/usuarios', 403],
    ['operador', 'GET', () => '/parametros', 403],
    ['admin', 'GET', () => '/usuarios', 200],
    ['admin', 'GET', () => '/parametros', 200],
    ['admin', 'GET', () => '/lotes', 200],
    ['admin', 'GET', () => '/relatorios/financeiro', 200],
  ];

  it.each(casos)('%s %s %s → %i', async (papel, metodo, url, esperado) => {
    const r = await amb.requisicao(papel, { method: metodo as 'GET' | 'POST', url: url(), payload: metodo === 'POST' ? {} : undefined });
    expect(r.statusCode).toBe(esperado);
  });

  it('qualquer papel autenticado pode trocar a própria senha', async () => {
    const r = await amb.requisicao('auditor', {
      method: 'PATCH',
      url: '/auth/senha',
      payload: { senhaAtual: 'SenhaTeste@123', senhaNova: 'NovaSenha@456' },
    });
    expect(r.statusCode).toBe(204);
    const login = await amb.app.inject({ method: 'POST', url: '/auth/login', payload: { usuario: 'auditor', senha: 'NovaSenha@456' } });
    expect(login.statusCode).toBe(200);
  });

  it('ADMINISTRADOR cria contas; usuário duplicado → 409', async () => {
    const payload = { usuario: 'novo.auditor', senha: 'Senha@12345', papel: 'AUDITOR' };
    const criado = await amb.requisicao('admin', { method: 'POST', url: '/usuarios', payload });
    expect(criado.statusCode).toBe(201);
    expect(criado.json()).not.toHaveProperty('hashSenha');
    const duplicado = await amb.requisicao('admin', { method: 'POST', url: '/usuarios', payload });
    expect(duplicado.statusCode).toBe(409);
  });

  it('ADMINISTRADOR ajusta parâmetro global (com validação de faixa)', async () => {
    const ok = await amb.requisicao('admin', { method: 'PATCH', url: '/parametros/CUSTO_DESCARTE_POR_KG', payload: { valorNumerico: 5.25 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().valorNumerico).toBe(5.25);
    const foraDaFaixa = await amb.requisicao('admin', { method: 'PATCH', url: '/parametros/ALIQUOTA_IMPOSTO_PADRAO', payload: { valorNumerico: 1.5 } });
    expect(foraDaFaixa.statusCode).toBe(400);
    const inexistente = await amb.requisicao('admin', { method: 'PATCH', url: '/parametros/NAO_EXISTE', payload: { valorNumerico: 1 } });
    expect(inexistente.statusCode).toBe(404);
  });
});
