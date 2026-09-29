import { Usuario } from './Usuario';

/** Somente leitura: consultas, relatórios e logs (FR11). */
export class Auditor extends Usuario {
  public permissoes(): string[] {
    return [
      'org listar', 'org buscar', 'lote listar', 'lote relatorio', 'equip rastrear',
      'rel organizacao', 'rel status', 'rel financeiro', 'log listar',
    ];
  }
}
