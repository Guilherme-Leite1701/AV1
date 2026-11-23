import { randomUUID } from 'node:crypto';
import cron, { ScheduledTask } from 'node-cron';
import { ErroTarefaIrrecuperavel } from '../domain/erros/ErrosAplicacao';
import { DadosTarefas, FilaTarefas, MetricasFila, NomeTarefa, POLITICA_RETRY, Processadores, atrasoBackoff } from './FilaTarefas';

interface JobMemoria {
  id: string;
  nome: NomeTarefa;
  dados: unknown;
  tentativa: number;
}

/**
 * Fila em memória para desenvolvimento e testes (sem Redis).
 * Mesma política de retry da FilaBullMQ, mas os jobs se perdem se o processo cair
 * e não há como dividir o trabalho entre processos: em produção use REDIS_URL.
 */
export class FilaMemoria implements FilaTarefas {
  public readonly tipo = 'memoria' as const;

  private readonly pendentes: JobMemoria[] = [];
  private readonly idsConhecidos = new Set<string>();
  private readonly temporizadores = new Set<NodeJS.Timeout>();
  private readonly agendas: ScheduledTask[] = [];
  private processadores: Processadores | null = null;
  private concorrencia = 1;
  private emExecucao = 0;
  private atrasadas = 0;
  private concluidas = 0;
  private falhas = 0;
  private encerrada = false;
  private esperandoOcioso: (() => void)[] = [];

  constructor(private readonly politica: { tentativas: number; atrasoInicialMs: number } = POLITICA_RETRY) {}

  /** Coloca o job na fila; ignora um idJob repetido (mesma idempotência do BullMQ). */
  public async enfileirar<N extends NomeTarefa>(nome: N, dados: DadosTarefas[N], opcoes: { idJob?: string } = {}): Promise<string> {
    const id = opcoes.idJob ?? randomUUID();
    if (this.idsConhecidos.has(id)) return id;
    this.idsConhecidos.add(id);
    this.pendentes.push({ id, nome, dados, tentativa: 1 });
    this.despachar();
    return id;
  }

  /** Usa node-cron no fuso de São Paulo. */
  public async agendarRecorrente<N extends NomeTarefa>(nome: N, padraoCron: string, dados: DadosTarefas[N]): Promise<void> {
    if (!cron.validate(padraoCron)) throw new Error(`Expressão cron inválida para ${nome}: ${padraoCron}`);
    const tarefa = cron.schedule(padraoCron, () => void this.enfileirar(nome, dados), { timezone: 'America/Sao_Paulo' });
    this.agendas.push(tarefa);
  }

  public async iniciarConsumidor(processadores: Processadores, concorrencia = 2): Promise<void> {
    this.processadores = processadores;
    this.concorrencia = Math.max(1, concorrencia);
    this.despachar();
  }

  public async obterMetricas(): Promise<MetricasFila> {
    return {
      aguardando: this.pendentes.length,
      ativas: this.emExecucao,
      atrasadas: this.atrasadas,
      concluidas: this.concluidas,
      falhas: this.falhas,
    };
  }

  /** Resolve quando não há nada pendente, em execução ou aguardando retry (útil nos testes). */
  public aguardarOcioso(): Promise<void> {
    if (this.ocioso()) return Promise.resolve();
    return new Promise((resolver) => this.esperandoOcioso.push(resolver));
  }

  public async encerrar(): Promise<void> {
    this.encerrada = true;
    for (const agenda of this.agendas) await agenda.stop();
    for (const t of this.temporizadores) clearTimeout(t);
    this.temporizadores.clear();
    this.atrasadas = 0;
    this.pendentes.length = 0;
    if (this.emExecucao > 0) await new Promise<void>((resolver) => this.esperandoOcioso.push(resolver));
    this.notificarSeOcioso();
  }

  private despachar(): void {
    if (!this.processadores || this.encerrada) return;
    while (this.emExecucao < this.concorrencia && this.pendentes.length > 0) {
      const job = this.pendentes.shift() as JobMemoria;
      this.emExecucao++;
      void this.executar(job).finally(() => {
        this.emExecucao--;
        this.despachar();
        this.notificarSeOcioso();
      });
    }
  }

  /** Executa uma tentativa; em caso de erro reagenda com backoff ou desiste. */
  private async executar(job: JobMemoria): Promise<void> {
    const processador = (this.processadores as Processadores)[job.nome] as (dados: unknown, ctx: unknown) => Promise<unknown>;
    const ultimaTentativa = job.tentativa >= this.politica.tentativas;
    try {
      await processador(job.dados, { idJob: job.id, tentativa: job.tentativa, maxTentativas: this.politica.tentativas, ultimaTentativa });
      this.concluidas++;
    } catch (erro) {
      if (ultimaTentativa || erro instanceof ErroTarefaIrrecuperavel || this.encerrada) {
        this.falhas++;
        return;
      }
      this.atrasadas++;
      const temporizador = setTimeout(
        () => {
          this.temporizadores.delete(temporizador);
          this.atrasadas--;
          this.pendentes.push({ ...job, tentativa: job.tentativa + 1 });
          this.despachar();
        },
        atrasoBackoff(job.tentativa, this.politica.atrasoInicialMs),
      );
      this.temporizadores.add(temporizador);
    }
  }

  private ocioso(): boolean {
    return this.pendentes.length === 0 && this.emExecucao === 0 && this.atrasadas === 0;
  }

  private notificarSeOcioso(): void {
    if (!this.ocioso() && !(this.encerrada && this.emExecucao === 0)) return;
    const esperando = this.esperandoOcioso.splice(0);
    for (const resolver of esperando) resolver();
  }
}
