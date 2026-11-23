import { PrismaClient, TarefaRelatorio } from '@prisma/client';
import { FormatoRelatorio, StatusTarefa, TipoRelatorioAssincrono } from '../domain/enums/TarefaRelatorio';
import { ArquivoRelatorio } from '../domain/relatorios/SerializadorRelatorio';
import { ClienteBD } from './infra';

export interface DadosCriacaoTarefa {
  tipo: TipoRelatorioAssincrono;
  formato: FormatoRelatorio;
  chaveApiId: string | null;
  solicitante: string;
  organizacaoId: string | null;
  webhookUrl: string | null;
}

export type ResumoTarefa = Omit<TarefaRelatorio, 'conteudo'>;

/** Estado das tarefas de relatório: a fila guarda só o id, o banco guarda o progresso e o arquivo. */
export class TarefaRelatorioRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public criar(dados: DadosCriacaoTarefa, tx: ClienteBD = this.prisma): Promise<TarefaRelatorio> {
    return tx.tarefaRelatorio.create({ data: dados });
  }

  /** Sem o conteúdo (para consultas de status). */
  public buscarResumo(id: string, tx: ClienteBD = this.prisma): Promise<ResumoTarefa | null> {
    return tx.tarefaRelatorio.findUnique({ where: { id }, omit: { conteudo: true } });
  }

  public buscarCompleta(id: string, tx: ClienteBD = this.prisma): Promise<TarefaRelatorio | null> {
    return tx.tarefaRelatorio.findUnique({ where: { id } });
  }

  /**
   * Só passa para PROCESSANDO se ainda não terminou: torna o processamento idempotente
   * (um job entregue duas vezes não refaz um relatório já CONCLUIDO).
   */
  public async marcarProcessando(id: string, tentativa: number, agora: Date, tx: ClienteBD = this.prisma): Promise<boolean> {
    const { count } = await tx.tarefaRelatorio.updateMany({
      where: { id, status: { in: [StatusTarefa.PENDENTE, StatusTarefa.PROCESSANDO] } },
      data: { status: StatusTarefa.PROCESSANDO, tentativas: tentativa, iniciadaEm: agora, erro: null },
    });
    return count > 0;
  }

  public concluir(
    id: string,
    arquivo: ArquivoRelatorio,
    agora: Date,
    expiraEm: Date,
    tx: ClienteBD = this.prisma,
  ): Promise<TarefaRelatorio> {
    return tx.tarefaRelatorio.update({
      where: { id },
      data: {
        status: StatusTarefa.CONCLUIDA,
        conteudo: arquivo.conteudo,
        nomeArquivo: arquivo.nomeArquivo,
        tamanhoBytes: arquivo.tamanhoBytes,
        concluidaEm: agora,
        expiraEm,
        erro: null,
      },
    });
  }

  /** Falha de uma tentativa: volta a PENDENTE (vai haver retry) ou fica FALHOU (definitiva). */
  public async registrarFalha(id: string, erro: string, definitiva: boolean, agora: Date, tx: ClienteBD = this.prisma): Promise<void> {
    await tx.tarefaRelatorio.updateMany({
      where: { id },
      data: {
        status: definitiva ? StatusTarefa.FALHOU : StatusTarefa.PENDENTE,
        erro: erro.slice(0, 2000),
        concluidaEm: definitiva ? agora : null,
      },
    });
  }

  public async marcarWebhookEntregue(id: string, agora: Date, tx: ClienteBD = this.prisma): Promise<void> {
    await tx.tarefaRelatorio.update({ where: { id }, data: { webhookEntregueEm: agora } });
  }

  /** FALHOU → PENDENTE para reprocessamento manual; false se a tarefa não estava FALHOU. */
  public async reabrir(id: string, tx: ClienteBD = this.prisma): Promise<boolean> {
    const { count } = await tx.tarefaRelatorio.updateMany({
      where: { id, status: StatusTarefa.FALHOU },
      data: { status: StatusTarefa.PENDENTE, tentativas: 0, erro: null, concluidaEm: null },
    });
    return count > 0;
  }

  public listar(
    filtro: { chaveApiId?: string; status?: StatusTarefa; limite: number },
    tx: ClienteBD = this.prisma,
  ): Promise<ResumoTarefa[]> {
    return tx.tarefaRelatorio.findMany({
      where: { chaveApiId: filtro.chaveApiId, status: filtro.status },
      omit: { conteudo: true },
      orderBy: { criadaEm: 'desc' },
      take: filtro.limite,
    });
  }

  /** Apaga os relatórios cujo prazo de download acabou; devolve quantos foram removidos. */
  public async excluirExpiradas(agora: Date, tx: ClienteBD = this.prisma): Promise<number> {
    const { count } = await tx.tarefaRelatorio.deleteMany({ where: { expiraEm: { lt: agora } } });
    return count;
  }
}
