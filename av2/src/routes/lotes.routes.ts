import { FastifyInstance } from 'fastify';
import {
  LoteController,
  RotaAdicionarEquipamentos,
  RotaBuscarLote,
  RotaCriarLote,
  RotaListarLotes,
  RotaRemoverEquipamento,
  RotaTriagem,
} from '../controllers/LoteController';
import { EstadoFisico } from '../domain/enums/EstadoFisico';
import { StatusLote } from '../domain/enums/StatusLote';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';
import { PERMISSOES } from '../middlewares/exigirPapel';
import { corpo, dataTexto, paramsId, protegida, queryVersao, texto, versao } from './comuns';

/** Só o formato; regras como "ano <= ano atual" ficam no domínio. */
const schemaEquipamento = corpo(
  {
    tipo: { type: 'string', enum: Object.values(TipoEquipamento) },
    marca: texto(1, 100),
    modelo: texto(1, 100),
    anoFabricacao: { type: 'integer' },
    estadoFisico: { type: 'string', enum: Object.values(EstadoFisico) },
    pesoQuilogramas: { type: 'number', exclusiveMinimum: 0 },
  },
  ['tipo', 'marca', 'modelo', 'anoFabricacao', 'estadoFisico', 'pesoQuilogramas'],
);

export function registrarRotasLotes(app: FastifyInstance, controller: LoteController): void {
  const ler = protegida(PERMISSOES.LER_LOTES);
  const escrever = protegida(PERMISSOES.ESCREVER_LOTES);

  app.post<RotaCriarLote>(
    '/lotes',
    {
      ...escrever,
      schema: {
        body: corpo(
          {
            organizacaoId: texto(1, 100),
            notaFiscal: texto(1, 60),
            transportadora: texto(1, 200),
            dataEntrada: dataTexto,
            observacoes: texto(0, 2000),
          },
          ['organizacaoId', 'notaFiscal', 'transportadora'],
        ),
      },
    },
    controller.criar,
  );

  app.get<RotaListarLotes>(
    '/lotes',
    {
      ...ler,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            organizacaoId: texto(1, 100),
            status: { type: 'string', enum: Object.values(StatusLote) },
            inicio: dataTexto,
            fim: dataTexto,
          },
        },
      },
    },
    controller.listar,
  );

  app.get<RotaBuscarLote>('/lotes/:id', { ...ler, schema: { params: paramsId } }, controller.buscar);

  app.post<RotaAdicionarEquipamentos>(
    '/lotes/:id/equipamentos',
    {
      ...escrever,
      schema: {
        params: paramsId,
        body: corpo({ equipamentos: { type: 'array', minItems: 1, maxItems: 500, items: schemaEquipamento } }, ['equipamentos']),
      },
    },
    controller.adicionarEquipamentos,
  );

  app.delete<RotaRemoverEquipamento>(
    '/lotes/:id/equipamentos/:equipId',
    {
      ...escrever,
      schema: {
        params: { type: 'object', required: ['id', 'equipId'], properties: { id: texto(1, 100), equipId: texto(1, 100) } },
        querystring: queryVersao,
      },
    },
    controller.removerEquipamento,
  );

  app.post<RotaTriagem>(
    '/lotes/:id/triagem',
    { ...escrever, schema: { params: paramsId, body: corpo({ versao }, ['versao']) } },
    controller.processarTriagem,
  );

  app.get<RotaBuscarLote>('/lotes/:id/relatorio-triagem', { ...ler, schema: { params: paramsId } }, controller.relatorioTriagem);
}
