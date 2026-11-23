import '@fastify/swagger';
import { FastifyInstance } from 'fastify';
import {
  AdminController,
  RotaEmitirChave,
  RotaExecutarAnalises,
  RotaListarChaves,
  RotaListarTarefas,
  RotaReprocessarTarefa,
  RotaRevogarChave,
} from '../controllers/AdminController';
import { ChaveApi } from '../domain/entidades/ChaveApi';
import { EscopoApi } from '../domain/enums/EscopoApi';
import { StatusTarefa } from '../domain/enums/TarefaRelatorio';
import { TipoAnalise } from '../domain/enums/TipoAnalise';
import { PERMISSOES } from '../middlewares/exigirPapel';
import { corpo, dataTexto, paramsId, protegida, queryVersao, texto } from './comuns';

const TAG = 'Administração';

/** Endpoints sob /api/v1/admin: só ADMINISTRADOR. */
export function registrarRotasAdmin(app: FastifyInstance, controller: AdminController): void {
  const admin = protegida(PERMISSOES.ADMINISTRAR_PLATAFORMA);
  const doc = (summary: string, description?: string) => ({ tags: [TAG], summary, description, security: [{ bearerAuth: [] }] });

  app.post<RotaEmitirChave>(
    '/chaves-api',
    {
      ...admin,
      schema: {
        ...doc('Emite uma chave de API para um parceiro', 'O texto da chave e o segredo do webhook aparecem só nesta resposta.'),
        body: corpo(
          {
            nome: texto(1, 120),
            escopos: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: Object.values(EscopoApi) } },
            organizacaoId: { ...texto(1, 100), description: 'Omitir = chave global (enxerga todas as organizações).' },
            limitePorMinuto: { type: 'integer', minimum: ChaveApi.LIMITE_MINIMO, maximum: ChaveApi.LIMITE_MAXIMO, default: 60 },
            expiraEm: dataTexto,
          },
          ['nome', 'escopos'],
        ),
      },
    },
    controller.emitirChave,
  );

  app.get<RotaListarChaves>(
    '/chaves-api',
    {
      ...admin,
      schema: {
        ...doc('Lista as chaves (sem o hash nem o segredo)'),
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { organizacaoId: texto(1, 100), incluirRevogadas: { type: 'boolean', default: false } },
        },
      },
    },
    controller.listarChaves,
  );

  app.delete<RotaRevogarChave>(
    '/chaves-api/:id',
    { ...admin, schema: { ...doc('Revoga uma chave (definitivo)'), params: paramsId, querystring: queryVersao } },
    controller.revogarChave,
  );

  app.post<RotaExecutarAnalises>(
    '/analises/executar',
    {
      ...admin,
      schema: {
        ...doc('Executa as análises agora e grava o resultado', 'Sem corpo, executa as três. O agendador faz o mesmo todo dia.'),
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            tipos: { type: 'array', uniqueItems: true, items: { type: 'string', enum: Object.values(TipoAnalise) } },
            inicio: dataTexto,
            fim: dataTexto,
          },
        },
      },
    },
    controller.executarAnalises,
  );

  app.get<RotaListarTarefas>(
    '/tarefas',
    {
      ...admin,
      schema: {
        ...doc('Lista as tarefas de relatório (monitoramento e dead-letter)'),
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: Object.values(StatusTarefa) },
            chaveApiId: texto(1, 100),
            limite: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          },
        },
      },
    },
    controller.listarTarefas,
  );

  app.post<RotaReprocessarTarefa>(
    '/tarefas/:id/reprocessar',
    { ...admin, schema: { ...doc('Devolve uma tarefa FALHOU para a fila'), params: paramsId } },
    controller.reprocessarTarefa,
  );

  app.get('/fila/metricas', { ...admin, schema: doc('Contadores da fila (aguardando, ativas, falhas...)') }, controller.metricasFila);
}
