"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Equipamento = void 0;
const crypto_1 = require("crypto");
const EstadoFisico_1 = require("../enums/EstadoFisico");
const StatusRastreamento_1 = require("../enums/StatusRastreamento");
const Movimentacao_1 = require("./Movimentacao");
/**
 * Unidade principal de rastreabilidade (FR05).
 * Composição: Equipamento --> Movimentacao (o histórico nasce e morre com o equipamento).
 */
class Equipamento {
    /** Depreciação linear padrão: 20% ao ano (vida útil de 5 anos). */
    static COEFICIENTE_PADRAO = 0.2;
    static RESPONSAVEL_SISTEMA = 'sistema';
    id;
    codigoBarrasInterno;
    tipo;
    marca;
    modelo;
    anoFabricacao;
    estadoFisico;
    pesoQuilogramas;
    loteId;
    posicaoNoLote;
    statusRastreamento;
    historicoMovimentacao;
    constructor(id, codigoBarrasInterno, tipo, marca, modelo, anoFabricacao, estadoFisico, pesoQuilogramas, loteId, posicaoNoLote) {
        if (!Number.isFinite(pesoQuilogramas) || pesoQuilogramas <= 0) {
            throw new Error('O peso do equipamento deve ser maior que zero.');
        }
        if (!Number.isInteger(anoFabricacao) || anoFabricacao > new Date().getFullYear()) {
            throw new Error('Ano de fabricação inválido.');
        }
        this.id = id;
        this.codigoBarrasInterno = codigoBarrasInterno;
        this.tipo = tipo;
        this.marca = marca;
        this.modelo = modelo;
        this.anoFabricacao = anoFabricacao;
        this.estadoFisico = estadoFisico;
        this.pesoQuilogramas = pesoQuilogramas;
        this.loteId = loteId;
        this.posicaoNoLote = posicaoNoLote;
        this.statusRastreamento = StatusRastreamento_1.StatusRastreamento.AGUARDANDO_TRIAGEM;
        this.historicoMovimentacao = [];
    }
    atualizarStatus(novoStatus, justificativa, responsavel = Equipamento.RESPONSAVEL_SISTEMA) {
        if (novoStatus === this.statusRastreamento) {
            throw new Error(`O equipamento já está com status ${novoStatus}.`);
        }
        const anterior = this.statusRastreamento;
        this.statusRastreamento = novoStatus;
        const local = this.localAtual();
        this.adicionarMovimentacao(local, local, responsavel, `Status: ${anterior} → ${novoStatus}. ${justificativa ?? ''}`.trim());
    }
    registrarMovimentacao(destino, responsavel) {
        if (!destino?.trim())
            throw new Error('Destino da movimentação é obrigatório.');
        if (!responsavel?.trim())
            throw new Error('Responsável pela movimentação é obrigatório.');
        this.adicionarMovimentacao(this.localAtual(), destino, responsavel, '');
    }
    /**
     * Fração já depreciada do equipamento, de 0 (novo) a 1 (totalmente depreciado),
     * pela idade desde o ano de fabricação. O coeficiente anual é um parâmetro
     * global definido pelo Administrador.
     */
    calcularDepreciacao(coeficienteAnual = Equipamento.COEFICIENTE_PADRAO) {
        const idade = Math.max(0, new Date().getFullYear() - this.anoFabricacao);
        return Math.min(1, idade * coeficienteAnual);
    }
    /**
     * [Fora do UML] Altera o estado físico aplicando a regra do FR06:
     * uma queda de duas ou mais categorias exige justificativa textual.
     */
    alterarEstadoFisico(novoEstado, justificativa, responsavel = Equipamento.RESPONSAVEL_SISTEMA) {
        if (novoEstado === this.estadoFisico) {
            throw new Error(`O equipamento já está no estado ${novoEstado}.`);
        }
        const queda = (0, EstadoFisico_1.ordemEstadoFisico)(novoEstado) - (0, EstadoFisico_1.ordemEstadoFisico)(this.estadoFisico);
        if (queda >= 2 && !justificativa?.trim()) {
            throw new Error(`Queda de ${queda} categorias (${this.estadoFisico} → ${novoEstado}) exige justificativa.`);
        }
        const anterior = this.estadoFisico;
        this.estadoFisico = novoEstado;
        const local = this.localAtual();
        this.adicionarMovimentacao(local, local, responsavel, `Estado físico: ${anterior} → ${novoEstado}. ${justificativa ?? ''}`.trim());
    }
    /** Recria um Equipamento (com seu histórico) a partir dos dados lidos do arquivo. */
    static reconstruir(dados) {
        const equipamento = new Equipamento(dados.id, dados.codigoBarrasInterno, dados.tipo, dados.marca, dados.modelo, dados.anoFabricacao, dados.estadoFisico, dados.pesoQuilogramas, dados.loteId, dados.posicaoNoLote);
        equipamento.statusRastreamento = dados.statusRastreamento;
        equipamento.historicoMovimentacao = (dados.historicoMovimentacao ?? []).map((m) => Movimentacao_1.Movimentacao.reconstruir(m));
        return equipamento;
    }
    /** Local atual = destino da última movimentação; sem histórico, o próprio lote. */
    localAtual() {
        const ultima = this.historicoMovimentacao[this.historicoMovimentacao.length - 1];
        return ultima ? ultima.getDestino() : `Lote ${this.loteId}`;
    }
    adicionarMovimentacao(origem, destino, responsavel, observacao) {
        this.historicoMovimentacao.push(new Movimentacao_1.Movimentacao((0, crypto_1.randomUUID)(), this.id, new Date(), origem, destino, responsavel, observacao));
    }
    getId() {
        return this.id;
    }
    getCodigoBarrasInterno() {
        return this.codigoBarrasInterno;
    }
    getTipo() {
        return this.tipo;
    }
    getMarca() {
        return this.marca;
    }
    getModelo() {
        return this.modelo;
    }
    getAnoFabricacao() {
        return this.anoFabricacao;
    }
    getEstadoFisico() {
        return this.estadoFisico;
    }
    getPesoQuilogramas() {
        return this.pesoQuilogramas;
    }
    getLoteId() {
        return this.loteId;
    }
    getPosicaoNoLote() {
        return this.posicaoNoLote;
    }
    getStatusRastreamento() {
        return this.statusRastreamento;
    }
    /** Devolve uma cópia: o histórico só cresce pelos métodos do próprio equipamento. */
    getHistoricoMovimentacao() {
        return [...this.historicoMovimentacao];
    }
}
exports.Equipamento = Equipamento;
