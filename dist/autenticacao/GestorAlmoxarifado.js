"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GestorAlmoxarifado = void 0;
const Usuario_1 = require("./Usuario");
/** Lotes, triagem, equipamentos e códigos de barras (FR04, FR05, FR06). */
class GestorAlmoxarifado extends Usuario_1.Usuario {
    permissoes() {
        return [
            'lote criar', 'lote listar', 'lote triagem', 'lote concluir', 'lote relatorio',
            'equip adicionar', 'equip status', 'equip estado', 'equip mover', 'equip rastrear',
        ];
    }
}
exports.GestorAlmoxarifado = GestorAlmoxarifado;
