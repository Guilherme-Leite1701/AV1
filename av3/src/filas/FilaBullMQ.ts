import { Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ErroTarefaIrrecuperavel } from '../domain/erros/ErrosAplicacao';
import { DadosTarefas, FilaTarefas, MetricasFila, NomeTarefa, POLITICA_RETRY, Processadores } from './FilaTarefas';

/** Nome da fila no Redis (todas as tarefas do greencode passam por ela). */
export const NOME_FILA = 'greencode-tarefas';

/** Cria a conexão no formato que o BullMQ exige (sem limite de retries por comando). */
export function criarConexaoRedis(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
}

/**
 * Fila durável sobre Redis com BullMQ. Os jobs sobrevivem a reinícios e vários
 * workers (em máquinas diferentes) dividem o trabalho: é o que dá a escala horizontal.
 * Jobs concluídos ficam 1 dia no Redis; os que falharam ficam 7 dias para investigação (dead-letter).
 */
export class FilaBullMQ implements FilaTarefas {
  public readonly tipo = 'bullmq' as const;

  private readonly conexaoFila: IORedis;
  private readonly fila: Queue;
  private worker: Worker | null = null;
  private readonly conexoesWorker: IORedis[] = [];

  constructor(private readonly urlRedis: string) {
    this.conexaoFila = criarConexaoRedis(urlRedis);
    this.fila = new Queue(NOME_FILA, {
      connection: this.conexaoFila,
      defaultJobOptions: {
        attempts: POLITICA_RETRY.tentativas,
        backoff: { type: 'exponential', delay: POLITICA_RETRY.atrasoInicialMs },
        removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    });
  }

  public async enfileirar<N extends NomeTarefa>(nome: N, dados: DadosTarefas[N], opcoes: { idJob?: string } = {}): Promise<string> {
    const job = await this.fila.add(nome, dados, { jobId: opcoes.idJob });
    return job.id ?? opcoes.idJob ?? '';
  }

  /** Job Scheduler do BullMQ: o agendamento fica no Redis, então só um worker dispara cada execução. */
  public async agendarRecorrente<N extends NomeTarefa>(nome: N, padraoCron: string, dados: DadosTarefas[N]): Promise<void> {
    await this.fila.upsertJobScheduler(`agenda:${nome}`, { pattern: padraoCron, tz: 'America/Sao_Paulo' }, { name: nome, data: dados });
  }

  /** Cria o Worker; ErroTarefaIrrecuperavel vira UnrecoverableError (vai direto para "failed", sem retry). */
  public async iniciarConsumidor(processadores: Processadores, concorrencia = 2): Promise<void> {
    const conexao = criarConexaoRedis(this.urlRedis);
    this.conexoesWorker.push(conexao);
    this.worker = new Worker(
      NOME_FILA,
      async (job: Job) => {
        const processador = processadores[job.name as NomeTarefa] as ((dados: unknown, ctx: unknown) => Promise<unknown>) | undefined;
        if (!processador) throw new UnrecoverableError(`Tarefa desconhecida: ${job.name}`);
        const maxTentativas = job.opts.attempts ?? 1;
        const tentativa = job.attemptsMade + 1;
        try {
          return await processador(job.data, {
            idJob: job.id ?? '',
            tentativa,
            maxTentativas,
            ultimaTentativa: tentativa >= maxTentativas,
          });
        } catch (erro) {
          if (erro instanceof ErroTarefaIrrecuperavel) throw new UnrecoverableError(erro.message);
          throw erro;
        }
      },
      { connection: conexao, concurrency: concorrencia },
    );
    await this.worker.waitUntilReady();
  }

  public async obterMetricas(): Promise<MetricasFila> {
    const c = await this.fila.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    return {
      aguardando: c.waiting ?? 0,
      ativas: c.active ?? 0,
      atrasadas: c.delayed ?? 0,
      concluidas: c.completed ?? 0,
      falhas: c.failed ?? 0,
    };
  }

  /** Fecha o worker primeiro (espera os jobs ativos) e depois as conexões. */
  public async encerrar(): Promise<void> {
    if (this.worker) await this.worker.close();
    await this.fila.close();
    for (const conexao of [this.conexaoFila, ...this.conexoesWorker]) {
      if (conexao.status !== 'end') await conexao.quit().catch(() => undefined);
    }
  }
}
