import { Usuario } from './Usuario';

/** Cadastro de organizações e contratos (FR02, FR03). */
export class OperadorCadastro extends Usuario {
  public permissoes(): string[] {
    return ['org cadastrar', 'org listar', 'org buscar', 'org endereco', 'org desativar', 'contrato renovar'];
  }
}
