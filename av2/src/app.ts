import fastifyJwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import { criarContainer } from './container';
import { tratadorErros } from './middlewares/tratadorErros';
import { registrarRotasAuth } from './routes/auth.routes';
import { registrarRotasEquipamentos } from './routes/equipamentos.routes';
import { registrarRotasLotes } from './routes/lotes.routes';
import { registrarRotasOrganizacoes } from './routes/organizacoes.routes';
import { registrarRotasRelatorios } from './routes/relatorios.routes';

export interface OpcoesApp {
  prisma: PrismaClient;
  jwtSecret: string;
  jwtExpiracao?: string;
  logger?: FastifyServerOptions['logger'];
}

/** Monta o app sem abrir a porta (os testes usam `app.inject()`). */
export async function construirApp(opcoes: OpcoesApp): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opcoes.logger ?? false,
    return503OnClosing: true,
  });

  await app.register(fastifyJwt, {
    secret: opcoes.jwtSecret,
    sign: { expiresIn: opcoes.jwtExpiracao ?? '30m' },
  });

  app.setErrorHandler((erro, request, reply) => tratadorErros(erro, request, reply));
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ statusCode: 404, erro: 'RotaNaoEncontrada', mensagem: `Rota ${request.method} ${request.url} não existe.` }),
  );

  app.addHook('onClose', async () => {
    await opcoes.prisma.$disconnect();
  });

  const container = criarContainer(opcoes.prisma, (payload) => app.jwt.sign(payload));

  app.get('/saude', async () => {
    await opcoes.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', banco: 'ok', horario: new Date().toISOString() };
  });

  registrarRotasAuth(app, container.authController);
  registrarRotasOrganizacoes(app, container.organizacaoController);
  registrarRotasLotes(app, container.loteController);
  registrarRotasEquipamentos(app, container.equipamentoController);
  registrarRotasRelatorios(app, container.relatorioController);

  return app;
}
