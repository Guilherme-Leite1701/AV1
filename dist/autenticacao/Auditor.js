"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Auditor = void 0;
const Usuario_1 = require("./Usuario");
/** Somente leitura: consultas, relatórios e logs (FR11). */
class Auditor extends Usuario_1.Usuario {
    permissoes() {
        return [
            'org listar', 'org buscar', 'lote listar', 'lote relatorio', 'equip rastrear',
            'rel organizacao', 'rel status', 'rel financeiro', 'log listar',
        ];
    }
}
exports.Auditor = Auditor;
