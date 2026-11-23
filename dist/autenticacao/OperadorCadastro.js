"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperadorCadastro = void 0;
const Usuario_1 = require("./Usuario");
/** Cadastro de organizações e contratos (FR02, FR03). */
class OperadorCadastro extends Usuario_1.Usuario {
    permissoes() {
        return ['org cadastrar', 'org listar', 'org buscar', 'org endereco', 'org desativar', 'contrato renovar'];
    }
}
exports.OperadorCadastro = OperadorCadastro;
