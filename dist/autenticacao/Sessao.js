"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sessao = void 0;
const crypto_1 = require("crypto");
/**
 * Sessão de um usuário autenticado.
 * Expira após 30 minutos sem atividade (NFR02); cada `renovar()` reinicia a contagem.
 */
class Sessao {
    static TEMPO_INATIVIDADE_MS = 30 * 60 * 1000;
    token;
    usuario;
    papel;
    criacao;
    expiracao;
    constructor(credencial) {
        this.token = (0, crypto_1.randomBytes)(32).toString('hex');
        this.usuario = credencial.getUsuario();
        this.papel = credencial.getPapel();
        this.criacao = new Date();
        this.expiracao = new Date(this.criacao.getTime() + Sessao.TEMPO_INATIVIDADE_MS);
    }
    isValida() {
        return Date.now() < this.expiracao.getTime();
    }
    renovar() {
        if (!this.isValida()) {
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        this.expiracao = new Date(Date.now() + Sessao.TEMPO_INATIVIDADE_MS);
    }
    getToken() {
        return this.token;
    }
    getUsuario() {
        return this.usuario;
    }
    getPapel() {
        return this.papel;
    }
    getCriacao() {
        return this.criacao;
    }
    getExpiracao() {
        return this.expiracao;
    }
}
exports.Sessao = Sessao;
