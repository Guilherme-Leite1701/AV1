import { FastifyRequest } from 'fastify';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { ServicoRelatorio } from '../services/ServicoRelatorio';
import { lerPeriodo } from './utils';

type QueryPeriodo = { Querystring: { inicio?: string; fim?: string } };
export type RotaRelatorioOrganizacao = { Params: { id: string } } & QueryPeriodo;
export type RotaRelatorioStatus = { Params: { status: StatusRastreamento } };
export type RotaRelatorioFinanceiro = QueryPeriodo;
export type RotaJournal = { Querystring: { entidade?: string; usuario?: string; limite?: number } };

export class RelatorioController {
  constructor(private readonly servico: ServicoRelatorio) {}

  public porOrganizacao = async (request: FastifyRequest<RotaRelatorioOrganizacao>) =>
    this.servico.gerarRelatorioPorOrganizacao(request.params.id, lerPeriodo(request.query));

  public porStatus = async (request: FastifyRequest<RotaRelatorioStatus>) =>
    this.servico.gerarRelatorioPorStatus(request.params.status);

  public financeiro = async (request: FastifyRequest<RotaRelatorioFinanceiro>) =>
    this.servico.gerarRelatorioFinanceiro(lerPeriodo(request.query));

  public journal = async (request: FastifyRequest<RotaJournal>) =>
    this.servico.listarJournal({
      entidade: request.query.entidade,
      usuario: request.query.usuario,
      limite: request.query.limite ?? 50,
    });
}
