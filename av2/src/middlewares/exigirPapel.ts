import { FastifyRequest } from 'fastify';
import { PapelUsuario } from '../domain/enums/PapelUsuario';
import { ErroAcessoNegado, ErroNaoAutenticado } from '../domain/erros/ErrosAplicacao';

const { ADMINISTRADOR, OPERADOR_CADASTRO, GESTOR_ALMOXARIFADO, AUDITOR } = PapelUsuario;

/** Matriz de permissões (RBAC). O AUDITOR só aparece nas listas de leitura. */
export const PERMISSOES = {
  GERENCIAR_USUARIOS: [ADMINISTRADOR],
  GERENCIAR_PARAMETROS: [ADMINISTRADOR],
  LER_ORGANIZACOES: [ADMINISTRADOR, OPERADOR_CADASTRO, GESTOR_ALMOXARIFADO, AUDITOR],
  ESCREVER_ORGANIZACOES: [ADMINISTRADOR, OPERADOR_CADASTRO],
  LER_LOTES: [ADMINISTRADOR, GESTOR_ALMOXARIFADO, AUDITOR],
  ESCREVER_LOTES: [ADMINISTRADOR, GESTOR_ALMOXARIFADO],
  LER_EQUIPAMENTOS: [ADMINISTRADOR, GESTOR_ALMOXARIFADO, AUDITOR],
  ESCREVER_EQUIPAMENTOS: [ADMINISTRADOR, GESTOR_ALMOXARIFADO],
  LER_RELATORIOS: [ADMINISTRADOR, AUDITOR],
  LER_JOURNAL: [ADMINISTRADOR, AUDITOR],
} as const satisfies Record<string, readonly PapelUsuario[]>;

/** Hook de autorização: 403 se o papel do usuário não estiver na lista. */
export function exigirPapel(papeisPermitidos: readonly PapelUsuario[]) {
  return async function verificarPapel(request: FastifyRequest): Promise<void> {
    const papel = request.user?.papel;
    if (!papel) throw new ErroNaoAutenticado('Usuário não autenticado.');
    if (!papeisPermitidos.includes(papel)) {
      throw new ErroAcessoNegado(
        `O papel ${papel} não pode executar ${request.method} ${request.routeOptions.url ?? request.url}. ` +
          `Papéis permitidos: ${papeisPermitidos.join(', ')}.`,
      );
    }
  };
}
