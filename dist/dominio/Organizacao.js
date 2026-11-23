"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Organizacao = void 0;
const Contrato_1 = require("./Contrato");
/**
 * Ator externo: geradores, operadores logísticos, desmontadores e compradores (FR02).
 * Associação: Organizacao --> Contrato (contrato vigente).
 */
class Organizacao {
    id;
    razaoSocial;
    cnpj;
    inscricaoEstadual;
    enderecoCompleto;
    telefone;
    email;
    dataCadastro;
    ativo;
    contratoVigente;
    constructor(id, razaoSocial, cnpj, inscricaoEstadual, enderecoCompleto, telefone, email, contratoVigente) {
        if (!razaoSocial?.trim())
            throw new Error('Razão social é obrigatória.');
        if (contratoVigente.getOrganizacaoId() !== id) {
            throw new Error('O contrato informado pertence a outra organização.');
        }
        this.id = id;
        this.razaoSocial = razaoSocial;
        this.cnpj = cnpj;
        this.inscricaoEstadual = inscricaoEstadual;
        this.enderecoCompleto = enderecoCompleto;
        this.telefone = telefone;
        this.email = email;
        this.dataCadastro = new Date();
        this.ativo = true;
        this.contratoVigente = contratoVigente;
    }
    alterarEndereco(novoEndereco) {
        if (!novoEndereco?.trim())
            throw new Error('Endereço não pode ser vazio.');
        this.enderecoCompleto = novoEndereco;
    }
    desativar() {
        this.ativo = false;
    }
    /** Recria uma Organizacao a partir dos dados lidos do arquivo. */
    static reconstruir(dados) {
        const organizacao = new Organizacao(dados.id, dados.razaoSocial, dados.cnpj, dados.inscricaoEstadual, dados.enderecoCompleto, dados.telefone, dados.email, Contrato_1.Contrato.reconstruir(dados.contratoVigente));
        organizacao.dataCadastro = new Date(dados.dataCadastro);
        organizacao.ativo = Boolean(dados.ativo);
        return organizacao;
    }
    getId() {
        return this.id;
    }
    getRazaoSocial() {
        return this.razaoSocial;
    }
    getCnpj() {
        return this.cnpj;
    }
    getInscricaoEstadual() {
        return this.inscricaoEstadual;
    }
    getEnderecoCompleto() {
        return this.enderecoCompleto;
    }
    getTelefone() {
        return this.telefone;
    }
    getEmail() {
        return this.email;
    }
    getDataCadastro() {
        return this.dataCadastro;
    }
    isAtivo() {
        return this.ativo;
    }
    getContratoVigente() {
        return this.contratoVigente;
    }
}
exports.Organizacao = Organizacao;
