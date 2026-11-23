"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfiguracaoMestre = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const Credencial_1 = require("../autenticacao/Credencial");
const PapelUsuario_1 = require("../enums/PapelUsuario");
const gravarAtomico_1 = require("./gravarAtomico");
/**
 * Arquivo de configuração mestre (FR12, NFR03).
 * Guarda a chave AES-256 dos dados e a credencial do primeiro administrador.
 *
 * O conteúdo é cifrado com AES-256 usando uma chave derivada da senha do
 * administrador (scrypt). Assim a chave mestra nunca fica em texto no disco,
 * e desbloquear o sistema exige a senha do administrador.
 */
class ConfiguracaoMestre {
    static USUARIO_ADMIN = 'admin';
    caminho;
    criptografia;
    chave;
    administrador;
    constructor(caminho, criptografia, chave, administrador) {
        this.caminho = caminho;
        this.criptografia = criptografia;
        this.chave = chave;
        this.administrador = administrador;
    }
    static existe(caminho) {
        return (0, fs_1.existsSync)(caminho);
    }
    /** Modo de provisionamento: gera a chave mestra e cria o administrador. */
    static provisionar(caminho, senhaAdmin, criptografia) {
        if (ConfiguracaoMestre.existe(caminho))
            throw new Error('O sistema já foi provisionado.');
        const administrador = Credencial_1.Credencial.criar(ConfiguracaoMestre.USUARIO_ADMIN, senhaAdmin, PapelUsuario_1.PapelUsuario.ADMINISTRADOR);
        const configuracao = new ConfiguracaoMestre(caminho, criptografia, criptografia.gerarChave(), administrador);
        configuracao.gravar(senhaAdmin);
        return configuracao;
    }
    /** Abre o arquivo mestre com a senha do administrador. */
    static desbloquear(caminho, senhaAdmin, criptografia) {
        const arquivo = JSON.parse((0, fs_1.readFileSync)(caminho, 'utf8'));
        const chaveDerivada = ConfiguracaoMestre.derivarChave(senhaAdmin, arquivo.salt);
        let conteudo;
        try {
            conteudo = JSON.parse(criptografia.decifrar(arquivo.dados, chaveDerivada));
        }
        catch {
            throw new Error('Senha do administrador incorreta ou arquivo mestre corrompido.');
        }
        return new ConfiguracaoMestre(caminho, criptografia, conteudo.chave, Credencial_1.Credencial.reconstruir(conteudo.administrador));
    }
    /** Troca a senha do administrador e cifra o arquivo mestre novamente. */
    alterarSenhaAdministrador(senhaNova) {
        this.administrador = Credencial_1.Credencial.criar(this.administrador.getUsuario(), senhaNova, PapelUsuario_1.PapelUsuario.ADMINISTRADOR);
        this.gravar(senhaNova);
    }
    getChave() {
        return this.chave;
    }
    getAdministrador() {
        return this.administrador;
    }
    gravar(senhaAdmin) {
        const salt = (0, crypto_1.randomBytes)(16).toString('hex');
        const conteudo = JSON.stringify({ chave: this.chave, administrador: this.administrador });
        const dados = this.criptografia.cifrar(conteudo, ConfiguracaoMestre.derivarChave(senhaAdmin, salt));
        (0, gravarAtomico_1.gravarAtomico)(this.caminho, JSON.stringify({ versao: 1, salt, dados }, null, 2));
    }
    /** scrypt: derivação de chave lenta de propósito, dificultando ataques de força bruta. */
    static derivarChave(senha, salt) {
        return (0, crypto_1.scryptSync)(senha, salt, 32).toString('hex');
    }
}
exports.ConfiguracaoMestre = ConfiguracaoMestre;
