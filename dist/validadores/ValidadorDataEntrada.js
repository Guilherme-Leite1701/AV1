"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidadorDataEntrada = void 0;
const Validador_1 = require("./Validador");
/**
 * Valida a data de entrada de um Lote (FR04):
 * não pode ser futura nem anterior a 90 dias.
 * A comparação é feita por dia (a hora é ignorada).
 */
class ValidadorDataEntrada extends Validador_1.Validador {
    static LIMITE_DIAS = 90;
    static MS_POR_DIA = 24 * 60 * 60 * 1000;
    validar(data) {
        this.mensagemErro = '';
        if (!(data instanceof Date) || isNaN(data.getTime())) {
            this.mensagemErro = 'Data de entrada inválida.';
            return false;
        }
        const hoje = ValidadorDataEntrada.inicioDoDia(new Date());
        const dia = ValidadorDataEntrada.inicioDoDia(data);
        if (dia.getTime() > hoje.getTime()) {
            this.mensagemErro = 'Data de entrada não pode ser futura.';
            return false;
        }
        const diferencaDias = Math.round((hoje.getTime() - dia.getTime()) / ValidadorDataEntrada.MS_POR_DIA);
        if (diferencaDias > ValidadorDataEntrada.LIMITE_DIAS) {
            this.mensagemErro = `Data de entrada não pode ser anterior a ${ValidadorDataEntrada.LIMITE_DIAS} dias.`;
            return false;
        }
        return true;
    }
    static inicioDoDia(data) {
        return new Date(data.getFullYear(), data.getMonth(), data.getDate());
    }
}
exports.ValidadorDataEntrada = ValidadorDataEntrada;
