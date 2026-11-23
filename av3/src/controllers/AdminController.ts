import { FastifyReply, FastifyRequest } from 'fastify';
import { EscopoApi } from '../domain/enums/EscopoApi';
import { StatusTarefa } from '../domain/enums/TarefaRelatorio';
import { OrigemExecucao, TipoAnalise } from '../domain/enums/TipoAnalise';
import { ServicoAnalise } from '../services/ServicoAnalise';
import { ServicoChaveApi } from '../services/ServicoChaveApi';
import { ServicoRelatorioAssincrono } from '../services/ServicoRelatorioAssincrono';
import { lerDataOpcional, lerPeriodo } from './utils';

export type RotaEmitirChave = {
  Body: { nome: string; escopos: EscopoApi[]; organizacaoId?: string; limitePorMinuto?: number; expiraEm?: string };
};
export type RotaListarChaves = { Querystring: { organizacaoId?: string; incluirRevogadas?: boolean } };
export type RotaRevogarChave = { Params: { id: string }; Querystring: { versao: number } };
export type RotaExecutarAnalises = { Body: { tipos?: TipoAnalise[]; inicio?: string; fim?: string } | undefined };
export type RotaListarTarefas = { Querystring: { status?: StatusTarefa; chaveApiId?: string; limite?: number } };
export type RotaReprocessarTarefa = { Params: { id: string } };

/** Endpoints /api/v1/admin (JWT de ADMINISTRADOR): chaves de parceiros, análises e fila. */
export class AdminController {
  constructor(
    private readonly chaves: ServicoChaveApi,
    private readonly analises: ServicoAnalise,
    private readonly relatorios: ServicoRelatorioAssincrono,
  ) {}

  public emitirChave = async (request: FastifyRequest<RotaEmitirChave>, reply: FastifyReply) => {
    const { expiraEm, ...dados } = request.body;
    const emitida = await this.chaves.emitir({ ...dados, expiraEm: lerDataOpcional(expiraEm, 'expiraEm') }, request.user);
    return reply.status(201).send(emitida);
  };

  public listarChaves = async (request: FastifyRequest<RotaListarChaves>) =>
    this.chaves.listar({ organizacaoId: request.query.organizacaoId, incluirRevogadas: request.query.incluirRevogadas ?? false });

  public revogarChave = async (request: FastifyRequest<RotaRevogarChave>) =>
    this.chaves.revogar(request.params.id, request.query.versao, request.user);

  /** Execução síncrona sob demanda (o agendador faz o mesmo em segundo plano). */
  public executarAnalises = async (request: FastifyRequest<RotaExecutarAnalises>) => {
    const corpo = request.body ?? {};
    const tipos = corpo.tipos?.length ? corpo.tipos : Object.values(TipoAnalise);
    const periodo = corpo.inicio || corpo.fim ? lerPeriodo(corpo) : undefined;
    const execucoes = [];
    for (const tipo of tipos) {
      const e = await this.analises.executar(tipo, { origem: OrigemExecucao.SOB_DEMANDA, solicitante: request.user.usuario, periodo });
      execucoes.push({ id: e.id, tipo: e.tipo, amostras: e.amostras, duracaoMs: e.duracaoMs, concluidaEm: e.concluidaEm });
    }
    return { execucoes };
  };

  public listarTarefas = async (request: FastifyRequest<RotaListarTarefas>) =>
    this.relatorios.listar({ status: request.query.status, chaveApiId: request.query.chaveApiId, limite: request.query.limite ?? 50 });

  public reprocessarTarefa = async (request: FastifyRequest<RotaReprocessarTarefa>, reply: FastifyReply) =>
    reply.status(202).send(await this.relatorios.reprocessar(request.params.id, request.user));

  public metricasFila = async () => this.relatorios.metricasFila();
}
