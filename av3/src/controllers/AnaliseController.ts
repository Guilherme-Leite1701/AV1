import { FastifyRequest } from 'fastify';
import { TipoAnalise } from '../domain/enums/TipoAnalise';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';
import { ServicoAnalise } from '../services/ServicoAnalise';

export type CaminhoAnalise = 'eficiencia' | 'rentabilidade' | 'vida-util';
export type RotaUltimaAnalise = { Params: { tipo: CaminhoAnalise } };
export type RotaListarExecucoes = { Querystring: { tipo?: TipoAnalise; limite?: number } };
export type RotaExecucao = { Params: { id: string } };
export type RotaHistoricoPrevisoes = { Querystring: { tipo?: TipoEquipamento; limite?: number } };

/** Caminho amigável na URL → tipo de análise. */
export const TIPO_POR_CAMINHO: Record<CaminhoAnalise, TipoAnalise> = {
  eficiencia: TipoAnalise.EFICIENCIA_OPERACIONAL,
  rentabilidade: TipoAnalise.RENTABILIDADE,
  'vida-util': TipoAnalise.VIDA_UTIL,
};

/** Endpoints /api/v1/internal/analises (JWT de ADMINISTRADOR ou AUDITOR). */
export class AnaliseController {
  constructor(private readonly servico: ServicoAnalise) {}

  public ultima = async (request: FastifyRequest<RotaUltimaAnalise>) =>
    this.servico.obterUltima(TIPO_POR_CAMINHO[request.params.tipo], request.user.usuario);

  public listarExecucoes = async (request: FastifyRequest<RotaListarExecucoes>) =>
    this.servico.listarExecucoes({ tipo: request.query.tipo, limite: request.query.limite ?? 20 });

  public buscarExecucao = async (request: FastifyRequest<RotaExecucao>) => this.servico.buscarExecucao(request.params.id);

  public historicoPrevisoes = async (request: FastifyRequest<RotaHistoricoPrevisoes>) =>
    this.servico.historicoPrevisoes({ tipo: request.query.tipo, limite: request.query.limite ?? 50 });
}
