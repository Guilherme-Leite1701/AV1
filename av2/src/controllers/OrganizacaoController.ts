import { FastifyReply, FastifyRequest } from 'fastify';
import { ServicoOrganizacao } from '../services/ServicoOrganizacao';
import { lerData, lerDataOpcional } from './utils';

export interface CorpoCriarOrganizacao {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual?: string;
  enderecoCompleto: string;
  telefone?: string;
  email?: string;
  contrato: {
    dataAssinatura: string;
    dataVencimento: string;
    clausulas?: string[];
    valorMensal: number;
    renovacaoAutomatica?: boolean;
  };
}

type ComId = { Params: { id: string } };
export type RotaCriarOrganizacao = { Body: CorpoCriarOrganizacao };
export type RotaListarOrganizacoes = { Querystring: { incluirInativas?: boolean } };
export type RotaBuscarOrganizacao = ComId;
export type RotaAlterarEndereco = ComId & { Body: { enderecoCompleto: string; versao: number } };
export type RotaDesativarOrganizacao = ComId & { Querystring: { versao: number } };
export type RotaRenovarContrato = ComId & { Body: { versao: number; novoVencimento?: string } };

export class OrganizacaoController {
  constructor(private readonly servico: ServicoOrganizacao) {}

  public criar = async (request: FastifyRequest<RotaCriarOrganizacao>, reply: FastifyReply) => {
    const { contrato, ...corpo } = request.body;
    const criada = await this.servico.cadastrarOrganizacao(
      {
        razaoSocial: corpo.razaoSocial.trim(),
        cnpj: corpo.cnpj,
        inscricaoEstadual: corpo.inscricaoEstadual ?? '',
        enderecoCompleto: corpo.enderecoCompleto.trim(),
        telefone: corpo.telefone ?? '',
        email: corpo.email ?? '',
        contrato: {
          dataAssinatura: lerData(contrato.dataAssinatura, 'contrato.dataAssinatura'),
          dataVencimento: lerData(contrato.dataVencimento, 'contrato.dataVencimento', true),
          clausulas: contrato.clausulas ?? [],
          valorMensal: contrato.valorMensal,
          renovacaoAutomatica: contrato.renovacaoAutomatica ?? false,
        },
      },
      request.user,
    );
    return reply.status(201).send(criada);
  };

  public listar = async (request: FastifyRequest<RotaListarOrganizacoes>) => {
    return this.servico.listarOrganizacoes(request.query.incluirInativas ?? false);
  };

  public buscar = async (request: FastifyRequest<RotaBuscarOrganizacao>) => this.servico.buscarOrganizacao(request.params.id);

  public alterarEndereco = async (request: FastifyRequest<RotaAlterarEndereco>) => {
    return this.servico.alterarEndereco(request.params.id, request.body.enderecoCompleto, request.body.versao, request.user);
  };

  public desativar = async (request: FastifyRequest<RotaDesativarOrganizacao>) => {
    return this.servico.desativarOrganizacao(request.params.id, request.query.versao, request.user);
  };

  public renovarContrato = async (
    request: FastifyRequest<RotaRenovarContrato>,
  ) => {
    return this.servico.renovarContrato(
      request.params.id,
      { versao: request.body.versao, novoVencimento: lerDataOpcional(request.body.novoVencimento, 'novoVencimento') },
      request.user,
    );
  };
}
