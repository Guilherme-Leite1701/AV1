import { RateLimitOptions } from '@fastify/rate-limit';
import { FastifyRequest } from 'fastify';
import { ChaveApi } from '../domain/entidades/ChaveApi';
import { EscopoApi } from '../domain/enums/EscopoApi';
import { ErroLimiteRequisicoes, ErroNaoAutenticado } from '../domain/erros/ErrosAplicacao';
import { ServicoChaveApi } from '../services/ServicoChaveApi';

/** `request.parceiro` existe em toda rota pública depois da autenticação. */
declare module 'fastify' {
  interface FastifyRequest {
    parceiro?: ChaveApi;
  }
}

export const CABECALHO_CHAVE = 'x-api-key';

/** Hook onRequest: lê X-API-Key, valida a chave e preenche `request.parceiro` (401 se falhar). */
export function criarAutenticacaoChaveApi(servico: ServicoChaveApi) {
  return async function autenticarChaveApi(request: FastifyRequest): Promise<void> {
    const valor = request.headers[CABECALHO_CHAVE];
    request.parceiro = await servico.autenticar(Array.isArray(valor) ? valor[0] : valor);
  };
}

/** Hook de autorização por escopo (403 se o contrato do parceiro não cobre a operação). */
export function exigirEscopo(escopo: EscopoApi) {
  return async function verificarEscopo(request: FastifyRequest): Promise<void> {
    if (!request.parceiro) throw new ErroNaoAutenticado('Chave de API não autenticada.');
    request.parceiro.garantirEscopo(escopo);
  };
}

/** Resposta 429 no mesmo formato de erro do resto da API (o plugin lança este objeto). */
export function respostaLimiteExcedido(_request: FastifyRequest, contexto: { max: number; after: string }) {
  return new ErroLimiteRequisicoes(`Limite de ${contexto.max} requisições por minuto atingido. Tente novamente em ${contexto.after}.`, {
    limite: contexto.max,
    tenteNovamenteEm: contexto.after,
  });
}

/**
 * Limite por chave: roda no preHandler (depois da autenticação) para usar o limite
 * contratado de cada parceiro. O groupId faz todas as rotas públicas dividirem o mesmo saldo.
 */
export const LIMITE_POR_CHAVE: RateLimitOptions = {
  groupId: 'api-publica',
  hook: 'preHandler',
  timeWindow: '1 minute',
  max: (request) => request.parceiro?.limitePorMinuto ?? 30,
  keyGenerator: (request) => (request.parceiro ? `chave:${request.parceiro.id}` : `ip:${request.ip}`),
};

/** Limite por IP para rotas sem chave (status público e login), com saldo separado por grupo. */
export function limitePorIp(grupo: string, maximo: number): RateLimitOptions {
  return { groupId: grupo, hook: 'onRequest', timeWindow: '1 minute', max: maximo, keyGenerator: (request) => `ip:${request.ip}` };
}
