import { OrigemExecucao } from '../domain/enums/TipoAnalise';

/** Dados de cada tipo de tarefa. O job leva só identificadores; o estado fica no banco. */
export interface DadosTarefas {
  'gerar-relatorio': { tarefaId: string };
  'executar-analises': { origem: OrigemExecucao; solicitante: string };
  'limpar-relatorios-expirados': Record<string, never>;
}

export type NomeTarefa = keyof DadosTarefas;

/** Informações da tentativa atual, entregues ao processador. */
export interface ContextoTentativa {
  idJob: string;
  tentativa: number;
  maxTentativas: number;
  ultimaTentativa: boolean;
}

export type Processador<N extends NomeTarefa> = (dados: DadosTarefas[N], contexto: ContextoTentativa) => Promise<unknown>;
export type Processadores = { [N in NomeTarefa]: Processador<N> };

/**
 * Política de retry: 3 tentativas com backoff exponencial (2 s, 4 s).
 * Falhas de ErroTarefaIrrecuperavel não são repetidas.
 */
export const POLITICA_RETRY = {
  tentativas: 3,
  atrasoInicialMs: 2_000,
} as const;

/** Atraso antes da tentativa n+1 (n começa em 1): atrasoInicial × 2^(n−1). */
export function atrasoBackoff(tentativaQueFalhou: number, atrasoInicialMs: number = POLITICA_RETRY.atrasoInicialMs): number {
  return atrasoInicialMs * 2 ** (tentativaQueFalhou - 1);
}

export type MetricasFila = Record<'aguardando' | 'ativas' | 'atrasadas' | 'concluidas' | 'falhas', number>;

/**
 * Porta (interface) da fila. O resto do sistema só conhece este contrato:
 * em produção a implementação é a FilaBullMQ (Redis); sem Redis, a FilaMemoria.
 */
export interface FilaTarefas {
  readonly tipo: 'bullmq' | 'memoria';

  /** Publica uma tarefa e devolve o id do job; `idJob` torna a publicação idempotente. */
  enfileirar<N extends NomeTarefa>(nome: N, dados: DadosTarefas[N], opcoes?: { idJob?: string }): Promise<string>;

  /** Agenda uma tarefa recorrente por expressão cron (idempotente: reagendar substitui). */
  agendarRecorrente<N extends NomeTarefa>(nome: N, padraoCron: string, dados: DadosTarefas[N]): Promise<void>;

  /** Começa a consumir os jobs (no processo da API ou no worker separado). */
  iniciarConsumidor(processadores: Processadores, concorrencia?: number): Promise<void>;

  obterMetricas(): Promise<MetricasFila>;

  /** Para de aceitar jobs, espera os que estão em execução e libera conexões. */
  encerrar(): Promise<void>;
}
