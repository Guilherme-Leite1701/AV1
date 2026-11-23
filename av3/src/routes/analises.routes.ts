import '@fastify/swagger';
import { FastifyInstance } from 'fastify';
import {
  AnaliseController,
  RotaExecucao,
  RotaHistoricoPrevisoes,
  RotaListarExecucoes,
  RotaUltimaAnalise,
  TIPO_POR_CAMINHO,
} from '../controllers/AnaliseController';
import { TipoAnalise } from '../domain/enums/TipoAnalise';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';
import { PERMISSOES } from '../middlewares/exigirPapel';
import { paramsId, protegida } from './comuns';

/** Endpoints internos da camada analítica (/api/v1/internal/analises). */
export function registrarRotasAnalises(app: FastifyInstance, controller: AnaliseController): void {
  const ler = protegida(PERMISSOES.LER_ANALISES);
  const limite = (padrao: number) => ({ type: 'integer', minimum: 1, maximum: 200, default: padrao }) as const;

  app.get<RotaListarExecucoes>(
    '/analises/execucoes',
    {
      ...ler,
      schema: {
        summary: 'Histórico de execuções (sem o resultado completo)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { tipo: { type: 'string', enum: Object.values(TipoAnalise) }, limite: limite(20) },
        },
      },
    },
    controller.listarExecucoes,
  );

  app.get<RotaExecucao>(
    '/analises/execucoes/:id',
    { ...ler, schema: { summary: 'Uma execução com o resultado completo', params: paramsId } },
    controller.buscarExecucao,
  );

  app.get<RotaHistoricoPrevisoes>(
    '/analises/vida-util/historico',
    {
      ...ler,
      schema: {
        summary: 'Série das previsões de vida útil (previsto × realizado)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { tipo: { type: 'string', enum: Object.values(TipoEquipamento) }, limite: limite(50) },
        },
      },
    },
    controller.historicoPrevisoes,
  );

  app.get<RotaUltimaAnalise>(
    '/analises/:tipo',
    {
      ...ler,
      schema: {
        summary: 'Resultado mais recente de uma análise',
        description: 'eficiencia = tempos e gargalos da triagem; rentabilidade = retorno por tipo; vida-util = regressão por tipo.',
        params: { type: 'object', required: ['tipo'], properties: { tipo: { type: 'string', enum: Object.keys(TIPO_POR_CAMINHO) } } },
      },
    },
    controller.ultima,
  );
}
