import { FastifyReply, FastifyRequest } from 'fastify';
import { DadosNovoEquipamento } from '../domain/entidades/Equipamento';
import { StatusLote } from '../domain/enums/StatusLote';
import { ServicoLote } from '../services/ServicoLote';
import { lerData, lerDataOpcional } from './utils';

type ComId = { Params: { id: string } };

export interface CorpoCriarLote {
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  dataEntrada?: string;
  observacoes?: string;
}

export type RotaCriarLote = { Body: CorpoCriarLote };
export type RotaListarLotes = {
  Querystring: { organizacaoId?: string; status?: StatusLote; inicio?: string; fim?: string };
};
export type RotaBuscarLote = ComId;
export type RotaAdicionarEquipamentos = ComId & { Body: { equipamentos: DadosNovoEquipamento[] } };
export type RotaRemoverEquipamento = { Params: { id: string; equipId: string }; Querystring: { versao: number } };
export type RotaTriagem = ComId & { Body: { versao: number } };

export class LoteController {
  constructor(private readonly servico: ServicoLote) {}

  public criar = async (request: FastifyRequest<RotaCriarLote>, reply: FastifyReply) => {
    const { dataEntrada, ...corpo } = request.body;
    const resultado = await this.servico.criarLote(
      { ...corpo, dataEntrada: lerDataOpcional(dataEntrada, 'dataEntrada') },
      request.user,
    );
    return reply.status(201).send(resultado);
  };

  public listar = async (
    request: FastifyRequest<RotaListarLotes>,
  ) => {
    const { organizacaoId, status, inicio, fim } = request.query;
    return this.servico.listarLotes({
      organizacaoId,
      status,
      inicio: inicio ? lerData(inicio, 'inicio') : undefined,
      fim: fim ? lerData(fim, 'fim', true) : undefined,
    });
  };

  public buscar = async (request: FastifyRequest<RotaBuscarLote>) => this.servico.buscarLote(request.params.id);

  public adicionarEquipamentos = async (
    request: FastifyRequest<RotaAdicionarEquipamentos>,
    reply: FastifyReply,
  ) => {
    const criados = await this.servico.adicionarEquipamentos(request.params.id, request.body.equipamentos, request.user);
    return reply.status(201).send(criados);
  };

  public removerEquipamento = async (
    request: FastifyRequest<RotaRemoverEquipamento>,
    reply: FastifyReply,
  ) => {
    await this.servico.removerEquipamento(request.params.id, request.params.equipId, request.query.versao, request.user);
    return reply.status(204).send();
  };

  public processarTriagem = async (request: FastifyRequest<RotaTriagem>) => {
    return this.servico.processarTriagem(request.params.id, request.body.versao, request.user);
  };

  public relatorioTriagem = async (request: FastifyRequest<RotaBuscarLote>) => this.servico.gerarRelatorioTriagem(request.params.id);
}
