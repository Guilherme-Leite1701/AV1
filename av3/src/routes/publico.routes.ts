import '@fastify/swagger';
import { FastifyInstance, onRequestHookHandler, preHandlerHookHandler } from 'fastify';
import {
  PublicoController,
  RotaListarLotesPublico,
  RotaLotePublico,
  RotaRastreamentoPublico,
  RotaRelatorioPublico,
  RotaSolicitarRelatorio,
  RotaSubmeterLote,
} from '../controllers/PublicoController';
import { EscopoApi } from '../domain/enums/EscopoApi';
import { StatusLote } from '../domain/enums/StatusLote';
import { FormatoRelatorio, TipoRelatorioAssincrono } from '../domain/enums/TarefaRelatorio';
import { LIMITE_POR_CHAVE, exigirEscopo, limitePorIp } from '../middlewares/autenticarChaveApi';
import { corpo, dataTexto, paramsId, texto } from './comuns';
import {
  loteDetalhePublico,
  loteResumoPublico,
  rastreamentoPublico,
  rentabilidadePublica,
  respostasErro,
  tarefaPublica,
  vidaUtilPublica,
} from './esquemasPublicos';
import { schemaEquipamento } from './lotes.routes';

export const VERSAO_API_PUBLICA = '1.0.0';
const TAG = 'API pública (parceiros)';

/**
 * Monta as opções comuns de uma rota pública: autenticação pela chave (onRequest),
 * escopo exigido + limite de taxa por chave (preHandler) e a segurança no Swagger.
 */
function rotaPublica(autenticar: onRequestHookHandler, escopo: EscopoApi, resumo: string, descricao?: string) {
  return {
    onRequest: [autenticar],
    preHandler: [exigirEscopo(escopo) as preHandlerHookHandler],
    config: { rateLimit: LIMITE_POR_CHAVE },
    schema: {
      tags: [TAG],
      summary: resumo,
      description: `${descricao ? `${descricao}\n\n` : ''}Escopo exigido: \`${escopo}\`.`,
      security: [{ chaveApi: [] }],
    },
  };
}

/** Endpoints para parceiros externos, sob o prefixo /api/v1/public; toda resposta leva o cabeçalho api-version. */
export function registrarRotasPublicas(app: FastifyInstance, controller: PublicoController, autenticar: onRequestHookHandler): void {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('api-version', VERSAO_API_PUBLICA);
  });

  app.get(
    '/status',
    {
      config: { rateLimit: limitePorIp('status-publico', 60) },
      schema: { tags: [TAG], summary: 'Disponibilidade e versão da API (sem chave)' },
    },
    controller.status,
  );

  const rastreamento = rotaPublica(
    autenticar,
    EscopoApi.RASTREABILIDADE_LER,
    'Rastreabilidade de um equipamento',
    'Histórico completo de movimentações, do recebimento ao destino final.',
  );
  app.get<RotaRastreamentoPublico>(
    '/equipamentos/:codigo/rastreamento',
    {
      ...rastreamento,
      schema: {
        ...rastreamento.schema,
        params: { type: 'object', required: ['codigo'], properties: { codigo: { ...texto(1, 100), examples: ['GC-NTB-2026-000001'] } } },
        response: { 200: rastreamentoPublico, ...respostasErro(401, 403, 404, 429) },
      },
    },
    controller.rastrear,
  );

  const lerLotes = rotaPublica(autenticar, EscopoApi.LOTES_LER, 'Lista os lotes da organização');
  app.get<RotaListarLotesPublico>(
    '/lotes',
    {
      ...lerLotes,
      schema: {
        ...lerLotes.schema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            organizacaoId: { ...texto(1, 100), description: 'Só para chaves globais.' },
            status: { type: 'string', enum: Object.values(StatusLote) },
            inicio: dataTexto,
            fim: dataTexto,
          },
        },
        response: { 200: { type: 'array', items: loteResumoPublico }, ...respostasErro(400, 401, 403, 429) },
      },
    },
    controller.listarLotes,
  );

  const lerLote = rotaPublica(autenticar, EscopoApi.LOTES_LER, 'Detalhe de um lote com seus equipamentos');
  app.get<RotaLotePublico>(
    '/lotes/:id',
    {
      ...lerLote,
      schema: { ...lerLote.schema, params: paramsId, response: { 200: loteDetalhePublico, ...respostasErro(401, 403, 404, 429) } },
    },
    controller.buscarLote,
  );

  const submeter = rotaPublica(
    autenticar,
    EscopoApi.LOTES_ESCREVER,
    'Submete um lote com os equipamentos (tudo ou nada)',
    'Cria o lote e todos os equipamentos numa única transação. A nota fiscal é única: reenviar o mesmo lote devolve 409.',
  );
  app.post<RotaSubmeterLote>(
    '/lotes',
    {
      ...submeter,
      schema: {
        ...submeter.schema,
        body: corpo(
          {
            organizacaoId: { ...texto(1, 100), description: 'Obrigatório só para chaves globais.' },
            notaFiscal: { ...texto(1, 60), examples: ['NF-2026-009001'] },
            transportadora: texto(1, 200),
            dataEntrada: dataTexto,
            observacoes: texto(0, 2000),
            equipamentos: { type: 'array', minItems: 1, maxItems: 500, items: schemaEquipamento },
          },
          ['notaFiscal', 'transportadora', 'equipamentos'],
        ),
        response: { 201: loteDetalhePublico, ...respostasErro(400, 401, 403, 404, 409, 422, 429) },
      },
    },
    controller.submeterLote,
  );

  const analises = rotaPublica(
    autenticar,
    EscopoApi.ANALISES_LER,
    'Rentabilidade média por tipo de equipamento',
    'Indicadores agregados de mercado, sem dados de nenhuma organização.',
  );
  app.get(
    '/analises/rentabilidade',
    { ...analises, schema: { ...analises.schema, response: { 200: rentabilidadePublica, ...respostasErro(401, 403, 429) } } },
    controller.rentabilidade,
  );

  const vidaUtil = rotaPublica(
    autenticar,
    EscopoApi.ANALISES_LER,
    'Modelos de vida útil remanescente por tipo',
    'Regressão linear (mínimos quadrados) do estado físico em função da idade.',
  );
  app.get(
    '/analises/vida-util',
    { ...vidaUtil, schema: { ...vidaUtil.schema, response: { 200: vidaUtilPublica, ...respostasErro(401, 403, 429) } } },
    controller.vidaUtil,
  );

  const solicitar = rotaPublica(
    autenticar,
    EscopoApi.RELATORIOS_GERAR,
    'Solicita um relatório assíncrono (202)',
    'Responde na hora com o id da tarefa. Acompanhe por polling em `links.status` ou informe `webhookUrl`: ' +
      'ao terminar, o greencode envia um POST assinado (cabeçalho `x-greencode-assinatura: sha256=<HMAC do corpo>`).',
  );
  app.post<RotaSolicitarRelatorio>(
    '/relatorios',
    {
      ...solicitar,
      schema: {
        ...solicitar.schema,
        body: corpo(
          {
            tipo: { type: 'string', enum: Object.values(TipoRelatorioAssincrono) },
            formato: { type: 'string', enum: Object.values(FormatoRelatorio), default: FormatoRelatorio.JSON },
            organizacaoId: { ...texto(1, 100), description: 'Só para chaves globais.' },
            webhookUrl: { type: 'string', maxLength: 2000, format: 'uri' },
          },
          ['tipo'],
        ),
        response: { 202: tarefaPublica, ...respostasErro(400, 401, 403, 429, 503) },
      },
    },
    controller.solicitarRelatorio,
  );

  const consultar = rotaPublica(autenticar, EscopoApi.RELATORIOS_GERAR, 'Status de um relatório (polling)');
  app.get<RotaRelatorioPublico>(
    '/relatorios/:id',
    {
      ...consultar,
      schema: { ...consultar.schema, params: paramsId, response: { 200: tarefaPublica, ...respostasErro(401, 403, 404, 429) } },
    },
    controller.statusRelatorio,
  );

  const baixar = rotaPublica(autenticar, EscopoApi.RELATORIOS_GERAR, 'Download do relatório concluído (JSON ou CSV)');
  app.get<RotaRelatorioPublico>(
    '/relatorios/:id/download',
    {
      ...baixar,
      schema: {
        ...baixar.schema,
        params: paramsId,
        produces: ['application/json', 'text/csv'],
        response: { ...respostasErro(401, 403, 404, 409, 410, 429) },
      },
    },
    controller.baixarRelatorio,
  );
}
