"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lote = void 0;
const StatusLote_1 = require("../enums/StatusLote");
const StatusRastreamento_1 = require("../enums/StatusRastreamento");
const Equipamento_1 = require("./Equipamento");
/**
 * Agrupa os materiais recebidos de uma Organização (FR04).
 * Associação: Lote --> Organizacao (por organizacaoId).
 * Agregação:  Lote --> Equipamento (1..N).
 */
class Lote {
    id;
    dataEntrada;
    organizacaoId;
    notaFiscal;
    transportadora;
    equipamentos;
    statusProcessamento;
    observacoes;
    constructor(id, dataEntrada, organizacaoId, notaFiscal, transportadora, observacoes = '') {
        this.id = id;
        this.dataEntrada = dataEntrada;
        this.organizacaoId = organizacaoId;
        this.notaFiscal = notaFiscal;
        this.transportadora = transportadora;
        this.equipamentos = [];
        this.statusProcessamento = StatusLote_1.StatusLote.RECEBIDO;
        this.observacoes = observacoes;
    }
    adicionarEquipamento(equip) {
        if (equip.getLoteId() !== this.id) {
            throw new Error('O equipamento foi criado para outro lote.');
        }
        if (this.equipamentos.some((e) => e.getId() === equip.getId())) {
            throw new Error('Este equipamento já está no lote.');
        }
        this.equipamentos.push(equip);
    }
    removerEquipamento(equipId) {
        const indice = this.equipamentos.findIndex((e) => e.getId() === equipId);
        if (indice < 0)
            return false;
        this.equipamentos.splice(indice, 1);
        return true;
    }
    calcularPesoTotal() {
        return this.equipamentos.reduce((total, e) => total + e.getPesoQuilogramas(), 0);
    }
    gerarRelatorioTriagem() {
        const linhas = [
            `Relatório de triagem — Lote ${this.id}`,
            `Entrada: ${this.dataEntrada.toLocaleDateString('pt-BR')} | NF: ${this.notaFiscal} | Transportadora: ${this.transportadora}`,
            `Status do lote: ${this.statusProcessamento}`,
            `Equipamentos: ${this.equipamentos.length} | Peso total: ${this.calcularPesoTotal().toFixed(2)} kg`,
            '',
            'Por status de rastreamento:',
        ];
        for (const status of Object.values(StatusRastreamento_1.StatusRastreamento)) {
            const quantidade = this.equipamentos.filter((e) => e.getStatusRastreamento() === status).length;
            if (quantidade > 0)
                linhas.push(`  ${status}: ${quantidade}`);
        }
        return linhas.join('\n');
    }
    /** [Fora do UML] Altera o status de processamento do lote. */
    alterarStatus(novoStatus) {
        this.statusProcessamento = novoStatus;
    }
    /** Recria um Lote (com seus equipamentos) a partir dos dados lidos do arquivo. */
    static reconstruir(dados) {
        const lote = new Lote(dados.id, new Date(dados.dataEntrada), dados.organizacaoId, dados.notaFiscal, dados.transportadora, dados.observacoes);
        lote.statusProcessamento = dados.statusProcessamento;
        lote.equipamentos = (dados.equipamentos ?? []).map((e) => Equipamento_1.Equipamento.reconstruir(e));
        return lote;
    }
    getId() {
        return this.id;
    }
    getDataEntrada() {
        return this.dataEntrada;
    }
    getOrganizacaoId() {
        return this.organizacaoId;
    }
    getNotaFiscal() {
        return this.notaFiscal;
    }
    getTransportadora() {
        return this.transportadora;
    }
    getEquipamentos() {
        return [...this.equipamentos];
    }
    getStatusProcessamento() {
        return this.statusProcessamento;
    }
    getObservacoes() {
        return this.observacoes;
    }
}
exports.Lote = Lote;
