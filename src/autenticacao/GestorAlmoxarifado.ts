import { Usuario } from './Usuario';

/** Lotes, triagem, equipamentos e códigos de barras (FR04, FR05, FR06). */
export class GestorAlmoxarifado extends Usuario {
  public permissoes(): string[] {
    return [
      'lote criar', 'lote listar', 'lote triagem', 'lote concluir', 'lote relatorio',
      'equip adicionar', 'equip status', 'equip estado', 'equip mover', 'equip rastrear',
    ];
  }
}
