import { FastifyReply, FastifyRequest } from 'fastify';
import { ChaveApi } from '../domain/entidades/ChaveApi';
import { DadosNovoEquipamento } from '../domain/entidades/Equipamento';
import { StatusLote } from '../domain/enums/StatusLote';
import { FormatoRelatorio, StatusTarefa, TipoRelatorioAssincrono } from '../domain/enums/TarefaRelatorio';
import { ServicoApiPublica } from '../services/ServicoApiPublica';
import { ServicoRelatorioAssincrono } from '../services/ServicoRelatorioAssincrono';
import { lerData, lerDataOpcional } from './utils';

export type RotaRastreamentoPublico = { Params: { codigo: string } };
export type RotaListarLotesPublico = { Querystring: { organizacaoId?: string; status?: StatusLote; inicio?: string; fim?: string } };
export type RotaLotePublico = { Params: { id: string } };
export type RotaSubmeterLote = {
  Body: {
    organizacaoId?: string;
    notaFiscal: string;
    transportadora: string;
    dataEntrada?: string;
    observacoes?: string;
    equipamentos: DadosNovoEquipamento[];
  };
};
export type RotaSolicitarRelatorio = {
  Body: { tipo: TipoRelatorioAssincrono; formato?: FormatoRelatorio; organizacaoId?: string; webhookUrl?: string };
};
export type RotaRelatorioPublico = { Params: { id: string } };

/** Endpoints /api/v1/public: `request.parceiro` já foi preenchido pelo hook da chave. */
export class PublicoController {
  constructor(
    private readonly api: ServicoApiPublica,
    private readonly relatorios: ServicoRelatorioAssincrono,
    private readonly versao: string,
  ) {}

  public status = async () => ({ servico: 'greencode', api: 'publica', versao: this.versao, horario: new Date().toISOString() });

  public rastrear = async (request: FastifyRequest<RotaRastreamentoPublico>) => this.api.rastrear(request.params.codigo, parceiro(request));

  public listarLotes = async (request: FastifyRequest<RotaListarLotesPublico>) =>
    this.api.listarLotes(
      {
        organizacaoId: request.query.organizacaoId,
        status: request.query.status,
        inicio: lerDataOpcional(request.query.inicio, 'inicio'),
        fim: request.query.fim ? lerData(request.query.fim, 'fim', true) : undefined,
      },
      parceiro(request),
    );

  public buscarLote = async (request: FastifyRequest<RotaLotePublico>) => this.api.buscarLote(request.params.id, parceiro(request));

  /** 201 com Location; a nota fiscal única evita lote duplicado se o parceiro reenviar. */
  public submeterLote = async (request: FastifyRequest<RotaSubmeterLote>, reply: FastifyReply) => {
    const { dataEntrada, ...corpo } = request.body;
    const criado = await this.api.submeterLote({ ...corpo, dataEntrada: lerDataOpcional(dataEntrada, 'dataEntrada') }, parceiro(request));
    return reply.status(201).header('location', `/api/v1/public/lotes/${criado.id}`).send(criado);
  };

  public rentabilidade = async () => this.api.rentabilidade();

  public vidaUtil = async () => this.api.vidaUtil();

  /** 202 Accepted: o relatório será gerado pela fila. */
  public solicitarRelatorio = async (request: FastifyRequest<RotaSolicitarRelatorio>, reply: FastifyReply) => {
    const tarefa = await this.relatorios.solicitar(
      { ...request.body, formato: request.body.formato ?? FormatoRelatorio.JSON },
      parceiro(request),
    );
    return reply.status(202).header('location', tarefa.links.status).send(tarefa);
  };

  /** Enquanto não termina, sugere ao cliente esperar 5 s antes do próximo polling. */
  public statusRelatorio = async (request: FastifyRequest<RotaRelatorioPublico>, reply: FastifyReply) => {
    const tarefa = await this.relatorios.consultar(request.params.id, parceiro(request));
    if (tarefa.status === StatusTarefa.PENDENTE || tarefa.status === StatusTarefa.PROCESSANDO) reply.header('retry-after', '5');
    return tarefa;
  };

  public baixarRelatorio = async (request: FastifyRequest<RotaRelatorioPublico>, reply: FastifyReply) => {
    const arquivo = await this.relatorios.baixar(request.params.id, parceiro(request));
    return reply
      .header('content-type', arquivo.tipoConteudo)
      .header('content-disposition', `attachment; filename="${arquivo.nomeArquivo}"`)
      .send(arquivo.conteudo);
  };
}

function parceiro(request: FastifyRequest): ChaveApi {
  return request.parceiro as ChaveApi;
}
