import { FastifyInstance } from 'fastify';
import {
  EquipamentoController,
  RotaEstadoFisico,
  RotaMovimentacao,
  RotaRastrear,
  RotaStatus,
} from '../controllers/EquipamentoController';
import { EstadoFisico } from '../domain/enums/EstadoFisico';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { PERMISSOES } from '../middlewares/exigirPapel';
import { corpo, paramsId, protegida, texto, versao } from './comuns';

/** `:id` aceita o UUID ou o código de barras. */
export function registrarRotasEquipamentos(app: FastifyInstance, controller: EquipamentoController): void {
  const ler = protegida(PERMISSOES.LER_EQUIPAMENTOS);
  const escrever = protegida(PERMISSOES.ESCREVER_EQUIPAMENTOS);

  app.get<RotaRastrear>('/equipamentos/:id/rastreamento', { ...ler, schema: { params: paramsId } }, controller.rastrear);

  app.patch<RotaEstadoFisico>(
    '/equipamentos/:id/estado-fisico',
    {
      ...escrever,
      schema: {
        params: paramsId,
        body: corpo(
          { estadoFisico: { type: 'string', enum: Object.values(EstadoFisico) }, justificativa: texto(0, 1000), versao },
          ['estadoFisico', 'versao'],
        ),
      },
    },
    controller.atualizarEstadoFisico,
  );

  app.patch<RotaStatus>(
    '/equipamentos/:id/status',
    {
      ...escrever,
      schema: {
        params: paramsId,
        body: corpo(
          {
            status: { type: 'string', enum: Object.values(StatusRastreamento) },
            versao,
            justificativa: texto(0, 1000),
            destino: texto(1, 200),
          },
          ['status', 'versao'],
        ),
      },
    },
    controller.atualizarStatus,
  );

  app.post<RotaMovimentacao>(
    '/equipamentos/:id/movimentacoes',
    {
      ...escrever,
      schema: { params: paramsId, body: corpo({ destino: texto(1, 200), observacao: texto(0, 1000) }, ['destino']) },
    },
    controller.registrarMovimentacao,
  );
}
