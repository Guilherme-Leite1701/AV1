"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JournalTransacao = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Entrada do journal de transações (FR07, NFR04).
 * Cada operação é registrada (cifrada, uma por linha) ANTES de ser aplicada aos dados.
 * - Rotação: ao passar de 10 MB, o arquivo atual é renomeado com data e hora.
 * - Retenção: arquivos rotacionados são mantidos por pelo menos 180 dias.
 */
class JournalTransacao {
    static TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;
    static RETENCAO_DIAS = 180;
    static caminhoArquivo = (0, path_1.join)('dados', 'journal.log');
    static criptografia = null;
    static chave = '';
    id;
    timestamp;
    operacao;
    entidade;
    dadosAntes;
    dadosDepois;
    usuarioResponsavel;
    constructor(operacao, entidade, dadosAntes, dadosDepois, usuarioResponsavel) {
        this.id = (0, crypto_1.randomUUID)();
        this.timestamp = new Date();
        this.operacao = operacao;
        this.entidade = entidade;
        this.dadosAntes = dadosAntes ?? null;
        this.dadosDepois = dadosDepois ?? null;
        this.usuarioResponsavel = usuarioResponsavel;
    }
    /** Define onde e com qual chave o journal é gravado. Chamado uma vez na inicialização. */
    static configurar(caminho, criptografia, chave) {
        JournalTransacao.caminhoArquivo = caminho;
        JournalTransacao.criptografia = criptografia;
        JournalTransacao.chave = chave;
    }
    registrar() {
        const criptografia = JournalTransacao.obterCriptografia();
        JournalTransacao.rotacionarSeNecessario();
        (0, fs_1.mkdirSync)((0, path_1.dirname)(JournalTransacao.caminhoArquivo), { recursive: true });
        (0, fs_1.appendFileSync)(JournalTransacao.caminhoArquivo, criptografia.cifrar(JSON.stringify(this), JournalTransacao.chave) + '\n', 'utf8');
    }
    /**
     * Registra uma transação de compensação (antes e depois invertidos).
     * Restaurar a entidade em si fica a cargo de quem chama, usando `getDadosAntes()`.
     */
    reverter() {
        if (this.dadosAntes === null && this.dadosDepois === null)
            return false;
        new JournalTransacao(`REVERSAO:${this.operacao}`, this.entidade, this.dadosDepois, this.dadosAntes, this.usuarioResponsavel).registrar();
        return true;
    }
    /** Lê as últimas entradas do journal atual, já decifradas (consulta do Auditor). */
    static lerUltimas(quantidade) {
        const criptografia = JournalTransacao.obterCriptografia();
        if (!(0, fs_1.existsSync)(JournalTransacao.caminhoArquivo))
            return [];
        return (0, fs_1.readFileSync)(JournalTransacao.caminhoArquivo, 'utf8')
            .split('\n')
            .filter((linha) => linha.trim() !== '')
            .slice(-quantidade)
            .map((linha) => JSON.parse(criptografia.decifrar(linha, JournalTransacao.chave)));
    }
    static obterCriptografia() {
        if (!JournalTransacao.criptografia)
            throw new Error('Journal não configurado.');
        return JournalTransacao.criptografia;
    }
    static rotacionarSeNecessario() {
        const caminho = JournalTransacao.caminhoArquivo;
        if (!(0, fs_1.existsSync)(caminho) || (0, fs_1.statSync)(caminho).size < JournalTransacao.TAMANHO_MAXIMO_BYTES)
            return;
        const { dir, name, ext } = (0, path_1.parse)(caminho);
        const carimbo = new Date().toISOString().replace(/[:.]/g, '-'); // ":" não é permitido em nomes no Windows
        (0, fs_1.renameSync)(caminho, (0, path_1.join)(dir, `${name}-${carimbo}${ext}`));
        // Retenção: só apaga arquivos rotacionados sem alteração há mais de 180 dias.
        const limite = Date.now() - JournalTransacao.RETENCAO_DIAS * 24 * 60 * 60 * 1000;
        for (const arquivo of (0, fs_1.readdirSync)(dir || '.')) {
            if (!arquivo.startsWith(`${name}-`) || !arquivo.endsWith(ext))
                continue;
            const completo = (0, path_1.join)(dir, arquivo);
            if ((0, fs_1.statSync)(completo).mtimeMs < limite)
                (0, fs_1.unlinkSync)(completo);
        }
    }
    getId() {
        return this.id;
    }
    getTimestamp() {
        return this.timestamp;
    }
    getOperacao() {
        return this.operacao;
    }
    getEntidade() {
        return this.entidade;
    }
    getDadosAntes() {
        return this.dadosAntes;
    }
    getDadosDepois() {
        return this.dadosDepois;
    }
    getUsuarioResponsavel() {
        return this.usuarioResponsavel;
    }
}
exports.JournalTransacao = JournalTransacao;
