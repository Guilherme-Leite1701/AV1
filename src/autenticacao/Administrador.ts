import { Usuario } from './Usuario';

/** Gestão de contas e parâmetros globais (FR10). */
export class Administrador extends Usuario {
  public permissoes(): string[] {
    return ['usuario criar', 'usuario listar', 'param listar', 'param definir', 'org listar', 'rel financeiro'];
  }
}
