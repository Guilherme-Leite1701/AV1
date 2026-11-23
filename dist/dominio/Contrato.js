"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Contrato = void 0;
/**
 * Contrato de coleta firmado com uma Organização geradora (FR03).
 */
class Contrato {
    id;
    organizacaoId;
    dataAssinatura;
    dataVencimento;
    clausulas;
    valorMensal;
    renovacaoAutomatica;
    constructor(id, organizacaoId, dataAssinatura, dataVencimento, clausulas, valorMensal, renovacaoAutomatica) {
        if (isNaN(dataAssinatura.getTime()) || isNaN(dataVencimento.getTime())) {
            throw new Error('Datas do contrato inválidas.');
        }
        if (dataVencimento.getTime() <= dataAssinatura.getTime()) {
            throw new Error('A data de vencimento deve ser posterior à data de assinatura.');
        }
        if (!Number.isFinite(valorMensal) || valorMensal < 0) {
            throw new Error('Valor mensal do contrato inválido.');
        }
        this.id = id;
        this.organizacaoId = organizacaoId;
        this.dataAssinatura = dataAssinatura;
        this.dataVencimento = dataVencimento;
        this.clausulas = [...clausulas];
        this.valorMensal = valorMensal;
        this.renovacaoAutomatica = renovacaoAutomatica;
    }
    estaVigente() {
        const agora = Date.now();
        return this.dataAssinatura.getTime() <= agora && agora <= this.dataVencimento.getTime();
    }
    renovar(novoVencimento) {
        if (isNaN(novoVencimento.getTime()) || novoVencimento.getTime() <= this.dataVencimento.getTime()) {
            throw new Error('O novo vencimento deve ser posterior ao vencimento atual.');
        }
        this.dataVencimento = novoVencimento;
    }
    /** Recria um Contrato a partir dos dados lidos do arquivo (datas voltam como texto). */
    static reconstruir(dados) {
        return new Contrato(dados.id, dados.organizacaoId, new Date(dados.dataAssinatura), new Date(dados.dataVencimento), dados.clausulas ?? [], Number(dados.valorMensal), Boolean(dados.renovacaoAutomatica));
    }
    getId() {
        return this.id;
    }
    getOrganizacaoId() {
        return this.organizacaoId;
    }
    getDataAssinatura() {
        return this.dataAssinatura;
    }
    getDataVencimento() {
        return this.dataVencimento;
    }
    getClausulas() {
        return [...this.clausulas];
    }
    getValorMensal() {
        return this.valorMensal;
    }
    isRenovacaoAutomatica() {
        return this.renovacaoAutomatica;
    }
}
exports.Contrato = Contrato;
