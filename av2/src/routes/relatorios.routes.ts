import { FastifyInstance } from 'fastify';
import {
  RelatorioController,
  RotaJournal,
  RotaRelatorioFinanceiro,
  RotaRelatorioOrganizacao,
  RotaRelatorioStatus,
} from '../controllers/RelatorioController';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { PERMISSOES } from '../middlewares/exigirPapel';
import { paramsId, protegida, queryPeriodo, texto } from './comuns';

export function registrarRotasRelatorios(app: FastifyInstance, controller: RelatorioController): void {
  const relatorios = protegida(PERMISSOES.LER_RELATORIOS);

  app.get<RotaRelatorioOrganizacao>('/relatorios/organizacao/:id', { ...relatorios, schema: { params: paramsId, querystring: queryPeriodo } }, controller.porOrganizacao);

  app.get<RotaRelatorioStatus>(
    '/relatorios/status/:status',
    {
      ...relatorios,
      schema: {
        params: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string', enum: Object.values(StatusRastreamento) } },
        },
      },
    },
    controller.porStatus,
  );

  app.get<RotaRelatorioFinanceiro>('/relatorios/financeiro', { ...relatorios, schema: { querystring: queryPeriodo } }, controller.financeiro);

  app.get<RotaJournal>(
    '/journal',
    {
      ...protegida(PERMISSOES.LER_JOURNAL),
      schema: {
        querystring: {
          type: 'object',
          properties: {
            entidade: texto(1, 60),
            usuario: texto(1, 30),
            limite: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          },
        },
      },
    },
    controller.journal,
  );
}
