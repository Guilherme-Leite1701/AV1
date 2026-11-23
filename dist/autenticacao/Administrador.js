"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Administrador = void 0;
const Usuario_1 = require("./Usuario");
/** Gestão de contas e parâmetros globais (FR10). */
class Administrador extends Usuario_1.Usuario {
    permissoes() {
        return ['usuario criar', 'usuario listar', 'param listar', 'param definir', 'org listar', 'rel financeiro'];
    }
}
exports.Administrador = Administrador;
