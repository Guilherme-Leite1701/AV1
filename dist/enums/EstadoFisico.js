"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EstadoFisico = void 0;
exports.ordemEstadoFisico = ordemEstadoFisico;
/**
 * Estados físicos em ordem do melhor para o pior.
 * A ordem de declaração importa: é ela que define "cair duas categorias" (FR06).
 */
var EstadoFisico;
(function (EstadoFisico) {
    EstadoFisico["NOVO"] = "NOVO";
    EstadoFisico["BOM_ESTADO"] = "BOM_ESTADO";
    EstadoFisico["USADO_LEVE"] = "USADO_LEVE";
    EstadoFisico["USADO_MODERADO"] = "USADO_MODERADO";
    EstadoFisico["DANIFICADO_LEVE"] = "DANIFICADO_LEVE";
    EstadoFisico["DANIFICADO_GRAVE"] = "DANIFICADO_GRAVE";
    EstadoFisico["INSERVIVEL"] = "INSERVIVEL";
})(EstadoFisico || (exports.EstadoFisico = EstadoFisico = {}));
/** Posição do estado na escala (0 = NOVO, 6 = INSERVIVEL). */
function ordemEstadoFisico(estado) {
    return Object.values(EstadoFisico).indexOf(estado);
}
