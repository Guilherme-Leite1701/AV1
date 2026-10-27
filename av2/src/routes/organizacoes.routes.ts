import { FastifyInstance } from 'fastify';
import {
  OrganizacaoController,
  RotaAlterarEndereco,
  RotaBuscarOrganizacao,
  RotaCriarOrganizacao,
  RotaDesativarOrganizacao,
  RotaListarOrganizacoes,
  RotaRenovarContrato,
} from '../controllers/OrganizacaoController';
import { PERMISSOES } from '../middlewares/exigirPapel';
import { corpo, dataTexto, paramsId, protegida, queryVersao, texto, versao } from './comuns';

const schemaContrato = corpo(
  {
    dataAssinatura: dataTexto,
    dataVencimento: dataTexto,
    clausulas: { type: 'array', maxItems: 50, items: texto(1, 1000) },
    valorMensal: { type: 'number', minimum: 0 },
    renovacaoAutomatica: { type: 'boolean' },
  },
  ['dataAssinatura', 'dataVencimento', 'valorMensal'],
);

const schemaCriar = corpo(
  {
    razaoSocial: texto(2, 200),
    cnpj: texto(14, 18),
    inscricaoEstadual: texto(0, 30),
    enderecoCompleto: texto(5, 300),
    telefone: texto(0, 30),
    email: { type: 'string', maxLength: 200, pattern: '^$|^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
    contrato: schemaContrato,
  },
  ['razaoSocial', 'cnpj', 'enderecoCompleto', 'contrato'],
);

export function registrarRotasOrganizacoes(app: FastifyInstance, controller: OrganizacaoController): void {
  const ler = protegida(PERMISSOES.LER_ORGANIZACOES);
  const escrever = protegida(PERMISSOES.ESCREVER_ORGANIZACOES);

  app.post<RotaCriarOrganizacao>('/organizacoes', { ...escrever, schema: { body: schemaCriar } }, controller.criar);

  app.get<RotaListarOrganizacoes>(
    '/organizacoes',
    {
      ...ler,
      schema: { querystring: { type: 'object', properties: { incluirInativas: { type: 'boolean', default: false } } } },
    },
    controller.listar,
  );

  app.get<RotaBuscarOrganizacao>('/organizacoes/:id', { ...ler, schema: { params: paramsId } }, controller.buscar);

  app.patch<RotaAlterarEndereco>(
    '/organizacoes/:id/endereco',
    { ...escrever, schema: { params: paramsId, body: corpo({ enderecoCompleto: texto(5, 300), versao }, ['enderecoCompleto', 'versao']) } },
    controller.alterarEndereco,
  );

  // DELETE /organizacoes/:id?versao=3
  app.delete<RotaDesativarOrganizacao>('/organizacoes/:id', { ...escrever, schema: { params: paramsId, querystring: queryVersao } }, controller.desativar);

  app.patch<RotaRenovarContrato>(
    '/organizacoes/:id/contrato/renovar',
    { ...escrever, schema: { params: paramsId, body: corpo({ versao, novoVencimento: dataTexto }, ['versao']) } },
    controller.renovarContrato,
  );
}
