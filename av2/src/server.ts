import { construirApp } from './app';
import { carregarConfiguracao } from './config/env';
import { criarPrismaClient } from './database/prisma';

/** Graceful shutdown: no SIGINT/SIGTERM fecha o servidor e o banco; força a saída após 10 s. */
async function iniciar(): Promise<void> {
  const config = carregarConfiguracao();
  const prisma = criarPrismaClient(config.databaseUrl);
  const app = await construirApp({
    prisma,
    jwtSecret: config.jwtSecret,
    jwtExpiracao: config.jwtExpiracao,
    logger: { level: config.nivelLog },
  });

  let encerrando = false;
  const encerrar = async (sinal: string): Promise<void> => {
    if (encerrando) return;
    encerrando = true;
    app.log.info(`Sinal ${sinal} recebido: encerrando com segurança...`);
    const forcar = setTimeout(() => {
      app.log.error('Encerramento demorou mais de 10 s: forçando a saída.');
      process.exit(1);
    }, 10_000);
    forcar.unref();
    try {
      await app.close();
      app.log.info('Servidor encerrado. Até logo!');
      process.exit(0);
    } catch (erro) {
      app.log.error({ err: erro }, 'Falha ao encerrar');
      process.exit(1);
    }
  };

  // SIGINT = Ctrl+C (Windows e Linux); SIGTERM = docker stop / systemd.
  process.once('SIGINT', () => void encerrar('SIGINT'));
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('unhandledRejection', (motivo) => {
    app.log.error({ err: motivo }, 'Promise rejeitada sem tratamento');
  });

  await app.listen({ host: config.host, port: config.porta });
}

iniciar().catch((erro) => {
  console.error('Não foi possível iniciar o servidor:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
