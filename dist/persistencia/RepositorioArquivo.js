"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepositorioArquivo = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const gravarAtomico_1 = require("./gravarAtomico");
const JournalTransacao_1 = require("./JournalTransacao");
/**
 * Persistência em arquivos cifrados com AES-256 (NFR03, NFR04).
 * Cada `nomeArquivo` (ex.: "organizacoes") vira um arquivo `<nome>.dat`
 * com a lista de entidades em JSON, cifrada.
 * Toda alteração passa antes pelo journal (write-ahead log).
 */
class RepositorioArquivo {
    diretorioBase;
    criptografia;
    chave;
    /** Usuário registrado no journal como responsável pelas alterações. */
    usuarioAtual = 'sistema';
    constructor(diretorioBase, criptografia, chave) {
        this.diretorioBase = diretorioBase;
        this.criptografia = criptografia;
        this.chave = chave;
    }
    definirUsuario(usuario) {
        this.usuarioAtual = usuario;
    }
    /** Insere a entidade ou, se já existir uma com o mesmo `id`, substitui. */
    salvarEntidade(nomeArquivo, entidade) {
        // Converte o objeto (com campos privados) em dados puros de JSON.
        const registro = JSON.parse(JSON.stringify(entidade));
        if (!registro?.id)
            throw new Error('A entidade precisa ter um id para ser salva.');
        const lista = this.lerArquivo(nomeArquivo);
        const indice = lista.findIndex((e) => e.id === registro.id);
        const antes = indice >= 0 ? lista[indice] : null;
        new JournalTransacao_1.JournalTransacao(antes ? 'ALTERAR' : 'CRIAR', nomeArquivo, antes, registro, this.usuarioAtual).registrar();
        if (indice >= 0) {
            lista[indice] = registro;
        }
        else {
            lista.push(registro);
        }
        this.gravarArquivo(nomeArquivo, lista);
    }
    /** Devolve os dados puros da entidade, ou `null` se não existir. */
    carregarEntidade(nomeArquivo, id) {
        return this.lerArquivo(nomeArquivo).find((e) => e.id === id) ?? null;
    }
    listarEntidades(nomeArquivo) {
        return this.lerArquivo(nomeArquivo);
    }
    excluirEntidade(nomeArquivo, id) {
        const lista = this.lerArquivo(nomeArquivo);
        const antes = lista.find((e) => e.id === id);
        if (!antes)
            throw new Error(`Registro ${id} não encontrado em ${nomeArquivo}.`);
        new JournalTransacao_1.JournalTransacao('EXCLUIR', nomeArquivo, antes, null, this.usuarioAtual).registrar();
        this.gravarArquivo(nomeArquivo, lista.filter((e) => e.id !== id));
    }
    caminho(nomeArquivo) {
        if (!/^[a-zA-Z0-9_-]+$/.test(nomeArquivo)) {
            throw new Error(`Nome de arquivo inválido: ${nomeArquivo}`);
        }
        return (0, path_1.join)(this.diretorioBase, `${nomeArquivo}.dat`);
    }
    lerArquivo(nomeArquivo) {
        const caminho = this.caminho(nomeArquivo);
        if (!(0, fs_1.existsSync)(caminho))
            return [];
        return JSON.parse(this.criptografia.decifrar((0, fs_1.readFileSync)(caminho, 'utf8'), this.chave));
    }
    gravarArquivo(nomeArquivo, lista) {
        (0, gravarAtomico_1.gravarAtomico)(this.caminho(nomeArquivo), this.criptografia.cifrar(JSON.stringify(lista), this.chave));
    }
}
exports.RepositorioArquivo = RepositorioArquivo;
