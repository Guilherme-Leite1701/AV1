"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Credencial = void 0;
const crypto_1 = require("crypto");
/**
 * Credencial de acesso de um usuário.
 * A senha nunca é guardada em texto: armazena-se SHA-256(salt + senha) (NFR01).
 */
class Credencial {
    usuario;
    hashSenha;
    salt;
    ultimoAcesso;
    papel;
    constructor(usuario, hashSenha, salt, ultimoAcesso, papel) {
        this.usuario = usuario;
        this.hashSenha = hashSenha;
        this.salt = salt;
        this.ultimoAcesso = ultimoAcesso;
        this.papel = papel;
    }
    static TAMANHO_MINIMO_SENHA = 8;
    /** Cria uma credencial nova a partir da senha em texto, gerando um salt aleatório. */
    static criar(usuario, senhaPlana, papel) {
        if (!/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) {
            throw new Error('Usuário deve ter de 3 a 30 caracteres (letras, números, ".", "_" ou "-").');
        }
        if (senhaPlana.length < Credencial.TAMANHO_MINIMO_SENHA) {
            throw new Error(`A senha deve ter pelo menos ${Credencial.TAMANHO_MINIMO_SENHA} caracteres.`);
        }
        const salt = (0, crypto_1.randomBytes)(16).toString('hex');
        return new Credencial(usuario, Credencial.gerarHash(senhaPlana, salt), salt, new Date(), papel);
    }
    /** Recria uma Credencial a partir dos dados lidos do arquivo. */
    static reconstruir(dados) {
        return new Credencial(dados.usuario, dados.hashSenha, dados.salt, new Date(dados.ultimoAcesso), dados.papel);
    }
    verificarSenha(senhaPlana) {
        const calculado = Buffer.from(Credencial.gerarHash(senhaPlana, this.salt), 'hex');
        const armazenado = Buffer.from(this.hashSenha, 'hex');
        // timingSafeEqual evita que o tempo de comparação revele quantos bytes coincidem.
        return calculado.length === armazenado.length && (0, crypto_1.timingSafeEqual)(calculado, armazenado);
    }
    atualizarUltimoAcesso() {
        this.ultimoAcesso = new Date();
    }
    getUsuario() {
        return this.usuario;
    }
    getPapel() {
        return this.papel;
    }
    getUltimoAcesso() {
        return this.ultimoAcesso;
    }
    static gerarHash(senhaPlana, salt) {
        return (0, crypto_1.createHash)('sha256').update(salt + senhaPlana).digest('hex');
    }
}
exports.Credencial = Credencial;
