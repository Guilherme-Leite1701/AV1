import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import type IORedis from 'ioredis';
import { criarContainer } from './container';
import { FilaMemoria } from './filas/FilaMemoria';
import { FilaTarefas } from './filas/FilaTarefas';
import { agendarTarefasRecorrentes } from './filas/processadores';
import { respostaLimiteExcedido } from './middlewares/autenticarChaveApi';
import { tratadorErros } from './middlewares/tratadorErros';
import { registrarRotasAdmin } from './routes/admin.routes';
import { registrarRotasAnalises } from './routes/analises.routes';
import { registrarRotasAuth } from './routes/auth.routes';
import { registrarRotasEquipamentos } from './routes/equipamentos.routes';
import { registrarRotasLotes } from './routes/lotes.routes';
import { registrarRotasOrganizacoes } from './routes/organizacoes.routes';
import { VERSAO_API_PUBLICA, registrarRotasPublicas } from './routes/publico.routes';
import { registrarRotasRelatorios } from './routes/relatorios.routes';
import { EnviarWebhook } from './services/ServicoRelatorioAssincrono';

export const PREFIXO_INTERNO = '/api/v1/internal';
export const PREFIXO_ADMIN = '/api/v1/admin';
export const PREFIXO_PUBLICO = '/api/v1/public';

export interface OpcoesApp {
  prisma: PrismaClient;
  jwtSecret: string;
  jwtExpiracao?: string;
  logger?: FastifyServerOptions['logger'];
  /** AV3: fila de tarefas (padrão: FilaMemoria). O app assume a posse e a fecha no app.close(). */
  fila?: FilaTarefas;
  /** Redis do rate limit: com ele o limite vale para todas as instâncias da API. */
  redisLimiteTaxa?: IORedis;
  /** Roda o worker dentro do processo da API (padrão: true). */
  consumirFila?: boolean;
  concorrenciaWorker?: number;
  /** Agenda as rotinas recorrentes; false desliga (testes e instâncias só de API). */
  agenda?: { cronAnalises: string; cronLimpeza: string } | false;
  /** Swagger UI em /docs (padrão: true). */
  documentacao?: boolean;
  permitirWebhookHttp?: boolean;
  enviarWebhook?: EnviarWebhook;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Acesso à fila e aos serviços da AV3 (usado pelos testes e pelo /saude). */
    greencode: { fila: FilaTarefas; container: ReturnType<typeof criarContainer> };
  }
}

/**
 * Monta o app sem abrir a porta (os testes usam `app.inject()`).
 * AV3: rate limit só nas rotas que pedem (com Redis, o contador é compartilhado entre instâncias);
 * rotas da AV2 sob /api/v1/internal, administração sob /api/v1/admin e parceiros sob /api/v1/public.
 * No encerramento, a fila termina os jobs (que usam o banco) antes de fechar Redis e banco.
 */
export async function construirApp(opcoes: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opcoes.logger ?? false,
    return503OnClosing: true,
  });

  await app.register(fastifyJwt, {
    secret: opcoes.jwtSecret,
    sign: { expiresIn: opcoes.jwtExpiracao ?? '30m' },
  });

  await app.register(fastifyRateLimit, {
    global: false,
    redis: opcoes.redisLimiteTaxa,
    nameSpace: 'greencode-limite:',
    skipOnError: true,
    errorResponseBuilder: respostaLimiteExcedido,
  });

  if (opcoes.documentacao ?? true) await registrarDocumentacao(app);

  app.setErrorHandler((erro, request, reply) => tratadorErros(erro, request, reply));
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ statusCode: 404, erro: 'RotaNaoEncontrada', mensagem: `Rota ${request.method} ${request.url} não existe.` }),
  );

  const fila = opcoes.fila ?? new FilaMemoria();
  const container = criarContainer(opcoes.prisma, (payload) => app.jwt.sign(payload), fila, {
    permitirWebhookHttp: opcoes.permitirWebhookHttp,
    enviarWebhook: opcoes.enviarWebhook,
  });
  app.decorate('greencode', { fila, container });

  app.addHook('onClose', async () => {
    await fila.encerrar();
    if (opcoes.redisLimiteTaxa && opcoes.redisLimiteTaxa.status !== 'end') await opcoes.redisLimiteTaxa.quit().catch(() => undefined);
    await opcoes.prisma.$disconnect();
  });

  app.get('/saude', { schema: { tags: ['Infraestrutura'], summary: 'Saúde do servidor, do banco e da fila' } }, async () => {
    await opcoes.prisma.$queryRaw`SELECT 1`;
    const metricas = await fila.obterMetricas().catch(() => null);
    return {
      status: 'ok',
      banco: 'ok',
      fila: metricas ? { tipo: fila.tipo, ...metricas } : 'indisponível',
      horario: new Date().toISOString(),
    };
  });

  await app.register(
    async (interno) => {
      marcarDocumentacao(interno, 'Interno');
      registrarRotasAuth(interno, container.authController);
      registrarRotasOrganizacoes(interno, container.organizacaoController);
      registrarRotasLotes(interno, container.loteController);
      registrarRotasEquipamentos(interno, container.equipamentoController);
      registrarRotasRelatorios(interno, container.relatorioController);
      registrarRotasAnalises(interno, container.analiseController);
    },
    { prefix: PREFIXO_INTERNO },
  );

  await app.register(async (admin) => registrarRotasAdmin(admin, container.adminController), { prefix: PREFIXO_ADMIN });

  await app.register(async (publico) => registrarRotasPublicas(publico, container.publicoController, container.autenticarChaveApi), {
    prefix: PREFIXO_PUBLICO,
  });

  if (opcoes.consumirFila ?? true) await fila.iniciarConsumidor(container.processadores, opcoes.concorrenciaWorker);
  if (opcoes.agenda) await agendarTarefasRecorrentes(fila, opcoes.agenda);

  return app;
}

/** OpenAPI 3 gerado a partir dos JSON Schemas das rotas + Swagger UI em /docs. */
async function registrarDocumentacao(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'greencode — API de logística reversa',
        version: VERSAO_API_PUBLICA,
        description:
          'API pública (parceiros, chave no cabeçalho `X-API-Key`), API interna (JWT do login) e administração. ' +
          'A versão maior fica na URL (`/api/v1`) e a versão completa no cabeçalho de resposta `api-version`.',
      },
      tags: [
        { name: 'API pública (parceiros)', description: 'Rastreabilidade, lotes, análises e relatórios assíncronos.' },
        { name: 'Administração', description: 'Chaves de API, execução de análises e monitoramento da fila.' },
        { name: 'Interno', description: 'Rotas da AV2 (front-end e equipe), autenticadas por JWT.' },
        { name: 'Infraestrutura' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          chaveApi: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    },
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' });
}

/** Coloca tag e segurança JWT nas rotas de um escopo que não declararam (as rotas da AV2). */
function marcarDocumentacao(escopo: FastifyInstance, tag: string): void {
  escopo.addHook('onRoute', (rota) => {
    const schema = (rota.schema ??= {}) as Record<string, unknown>;
    schema.tags ??= [tag];
    if (!rota.url.endsWith('/auth/login')) schema.security ??= [{ bearerAuth: [] }];
  });
}
