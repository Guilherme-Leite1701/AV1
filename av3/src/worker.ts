import { carregarConfiguracao } from './config/env';
import { criarContainer } from './container';
import { criarPrismaClient } from './database/prisma';
import { FilaBullMQ } from './filas/FilaBullMQ';
import { agendarTarefasRecorrentes } from './filas/processadores';

/**
 * Worker separado (npm run worker): consome a fila do Redis sem abrir porta HTTP.
 * Vários workers podem rodar em paralelo (em máquinas diferentes) para escalar o processamento.
 */
async function iniciarWorker(): Promise<void> {
  const config = carregarConfiguracao();
  if (!config.redisUrl) {
    throw new Error('O worker separado precisa de REDIS_URL. Sem Redis, o próprio servidor processa a fila (worker embutido).');
  }
  const prisma = criarPrismaClient(config.databaseUrl);
  const fila = new FilaBullMQ(config.redisUrl);
  const container = criarContainer(
    prisma,
    () => {
      throw new Error('O worker não emite tokens.');
    },
    fila,
    { permitirWebhookHttp: config.permitirWebhookHttp },
  );

  await fila.iniciarConsumidor(container.processadores, config.concorrenciaWorker);
  await agendarTarefasRecorrentes(fila, { cronAnalises: config.cronAnalises, cronLimpeza: config.cronLimpeza });
  console.log(`Worker do greencode ativo (concorrência ${config.concorrenciaWorker}). Ctrl+C para encerrar.`);

  let encerrando = false;
  const encerrar = async (sinal: string): Promise<void> => {
    if (encerrando) return;
    encerrando = true;
    console.log(`Sinal ${sinal}: terminando os jobs em andamento...`);
    const forcar = setTimeout(() => process.exit(1), 30_000);
    forcar.unref();
    await fila.encerrar();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void encerrar('SIGINT'));
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
}

iniciarWorker().catch((erro) => {
  console.error('Não foi possível iniciar o worker:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
