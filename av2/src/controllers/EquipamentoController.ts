import { FastifyReply, FastifyRequest } from 'fastify';
import { EstadoFisico } from '../domain/enums/EstadoFisico';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { ServicoEquipamento } from '../services/ServicoEquipamento';

type ComId = { Params: { id: string } };
export type RotaRastrear = ComId;
export type RotaEstadoFisico = ComId & { Body: { estadoFisico: EstadoFisico; justificativa?: string; versao: number } };
export type RotaStatus = ComId & {
  Body: { status: StatusRastreamento; versao: number; justificativa?: string; destino?: string };
};
export type RotaMovimentacao = ComId & { Body: { destino: string; observacao?: string } };

export class EquipamentoController {
  constructor(private readonly servico: ServicoEquipamento) {}

  public rastrear = async (request: FastifyRequest<RotaRastrear>) => this.servico.rastrearEquipamento(request.params.id);

  public atualizarEstadoFisico = async (
    request: FastifyRequest<RotaEstadoFisico>,
  ) => this.servico.atualizarEstadoFisico(request.params.id, request.body, request.user);

  public atualizarStatus = async (
    request: FastifyRequest<RotaStatus>,
  ) => this.servico.atualizarStatus(request.params.id, request.body, request.user);

  public registrarMovimentacao = async (
    request: FastifyRequest<RotaMovimentacao>,
    reply: FastifyReply,
  ) => {
    const movimentacao = await this.servico.registrarMovimentacao(request.params.id, request.body, request.user);
    return reply.status(201).send(movimentacao);
  };
}
