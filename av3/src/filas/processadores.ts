import { OrigemExecucao } from '../domain/enums/TipoAnalise';
import { ServicoAnalise } from '../services/ServicoAnalise';
import { ServicoRelatorioAssincrono } from '../services/ServicoRelatorioAssincrono';
import { FilaTarefas, Processadores } from './FilaTarefas';

/** Liga cada nome de tarefa ao serviço que a executa (usado pelo worker). */
export function criarProcessadores(servicos: { relatorios: ServicoRelatorioAssincrono; analises: ServicoAnalise }): Processadores {
  return {
    'gerar-relatorio': (dados, contexto) => servicos.relatorios.processar(dados, contexto),
    'executar-analises': (dados) => servicos.analises.executarTodas({ origem: dados.origem, solicitante: dados.solicitante }),
    'limpar-relatorios-expirados': () => servicos.relatorios.limparExpirados(),
  };
}

/** Agenda as rotinas: análises diárias (padrão 02:00) e limpeza de relatórios expirados (de hora em hora). */
export async function agendarTarefasRecorrentes(fila: FilaTarefas, agenda: { cronAnalises: string; cronLimpeza: string }): Promise<void> {
  await fila.agendarRecorrente('executar-analises', agenda.cronAnalises, { origem: OrigemExecucao.AGENDADA, solicitante: 'agendador' });
  await fila.agendarRecorrente('limpar-relatorios-expirados', agenda.cronLimpeza, {});
}
