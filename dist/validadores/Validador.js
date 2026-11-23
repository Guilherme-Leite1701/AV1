"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validador = void 0;
/**
 * Classe base abstrata dos validadores de regra de negócio.
 * Cada subclasse implementa `validar` para o seu tipo de dado e,
 * em caso de falha, preenche `mensagemErro`.
 */
class Validador {
    mensagemErro = '';
    obterMensagemErro() {
        return this.mensagemErro;
    }
}
exports.Validador = Validador;
