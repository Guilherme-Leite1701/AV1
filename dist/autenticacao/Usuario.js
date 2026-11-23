"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Usuario = void 0;
const Sessao_1 = require("./Sessao");
/**
 * Classe base dos papéis (Fase 1: BaseUser).
 * Centraliza o que é igual para todos: verificação de senha (SHA-256, via Credencial)
 * e a sessão com expiração de 30 minutos (via Sessao).
 * Cada subclasse define apenas o que muda: as permissões.
 */
class Usuario {
    credencial;
    sessao = null;
    constructor(credencial) {
        this.credencial = credencial;
    }
    autenticar(usuario, senha) {
        if (usuario !== this.credencial.getUsuario() || !this.credencial.verificarSenha(senha)) {
            return false;
        }
        this.credencial.atualizarUltimoAcesso();
        this.sessao = new Sessao_1.Sessao(this.credencial);
        return true;
    }
    /** Reinicia a contagem de inatividade e devolve o token da sessão. */
    renovarToken() {
        if (!this.sessao)
            throw new Error('Usuário não autenticado.');
        this.sessao.renovar();
        return this.sessao.getToken();
    }
    /** Polimorfismo: a pergunta é a mesma, a resposta depende do papel. */
    podeExecutar(comando) {
        return this.permissoes().includes(comando);
    }
    getNome() {
        return this.credencial.getUsuario();
    }
    getPapel() {
        return this.credencial.getPapel();
    }
    getSessao() {
        return this.sessao;
    }
}
exports.Usuario = Usuario;
