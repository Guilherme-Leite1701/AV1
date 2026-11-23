"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Movimentacao = void 0;
/**
 * Registro de auditoria de uma mudança do equipamento (FR06).
 * Imutável: depois de criada, uma movimentação não é alterada.
 */
class Movimentacao {
    id;
    equipamentoId;
    dataHora;
    origem;
    destino;
    responsavel;
    observacao;
    constructor(id, equipamentoId, dataHora, origem, destino, responsavel, observacao) {
        this.id = id;
        this.equipamentoId = equipamentoId;
        this.dataHora = dataHora;
        this.origem = origem;
        this.destino = destino;
        this.responsavel = responsavel;
        this.observacao = observacao;
    }
    /** Recria uma Movimentacao a partir dos dados lidos do arquivo. */
    static reconstruir(dados) {
        return new Movimentacao(dados.id, dados.equipamentoId, new Date(dados.dataHora), dados.origem, dados.destino, dados.responsavel, dados.observacao);
    }
    getId() {
        return this.id;
    }
    getEquipamentoId() {
        return this.equipamentoId;
    }
    getDataHora() {
        return this.dataHora;
    }
    getOrigem() {
        return this.origem;
    }
    getDestino() {
        return this.destino;
    }
    getResponsavel() {
        return this.responsavel;
    }
    getObservacao() {
        return this.observacao;
    }
}
exports.Movimentacao = Movimentacao;
