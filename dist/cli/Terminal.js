"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Terminal = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const readline = __importStar(require("readline"));
/**
 * Entrada e saída do terminal sobre a biblioteca readline:
 * - histórico de comandos persistente entre sessões;
 * - autocompletar com a tecla Tab;
 * - leitura de senha sem mostrar o que é digitado.
 */
class Terminal {
    static LIMITE_HISTORICO = 200;
    rl;
    caminhoHistorico;
    historico;
    completar = () => [];
    // As linhas chegam por eventos; esta fila as entrega uma de cada vez, na ordem.
    fila = [];
    aguardando = null;
    fechado = false;
    silenciado = false;
    constructor(caminhoHistorico) {
        this.caminhoHistorico = caminhoHistorico;
        this.historico = this.carregarHistorico();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            history: [...this.historico],
            historySize: Terminal.LIMITE_HISTORICO,
            completer: (linha) => {
                const opcoes = this.completar(linha);
                const encontrados = opcoes.filter((o) => o.startsWith(linha));
                return [encontrados.length > 0 ? encontrados : opcoes, linha];
            },
        });
        // Enquanto `silenciado`, o readline não ecoa o que é digitado (senhas).
        const interno = this.rl;
        const escreverOriginal = interno._writeToOutput.bind(interno);
        interno._writeToOutput = (texto) => {
            if (!this.silenciado)
                escreverOriginal(texto);
        };
        this.rl.on('line', (linha) => this.entregar(linha));
        this.rl.on('close', () => {
            this.fechado = true;
            this.entregar(null);
        });
    }
    /** Define as sugestões do Tab (muda conforme o papel do usuário logado). */
    definirCompletar(funcao) {
        this.completar = funcao;
    }
    /** Lê um comando. Retorna `null` quando a entrada termina (Ctrl+D / fim do arquivo). */
    async lerComando(prompt) {
        this.rl.setPrompt(prompt);
        this.rl.prompt();
        const linha = await this.proximaLinha();
        if (linha && linha.trim())
            this.salvarNoHistorico(linha.trim());
        return linha;
    }
    /** Lê uma senha sem exibi-la e sem guardá-la no histórico. */
    async lerSenha(pergunta) {
        process.stdout.write(pergunta);
        this.silenciado = true;
        const linha = await this.proximaLinha();
        this.silenciado = false;
        process.stdout.write('\n');
        // Remove a senha do histórico em memória do readline (setas ↑/↓).
        const historicoInterno = this.rl.history;
        if (historicoInterno && linha && historicoInterno[0] === linha)
            historicoInterno.shift();
        return linha;
    }
    fechar() {
        this.rl.close();
    }
    entregar(linha) {
        if (this.aguardando) {
            const resolver = this.aguardando;
            this.aguardando = null;
            resolver(linha);
        }
        else if (linha !== null) {
            this.fila.push(linha);
        }
    }
    proximaLinha() {
        if (this.fila.length > 0)
            return Promise.resolve(this.fila.shift());
        if (this.fechado)
            return Promise.resolve(null);
        return new Promise((resolver) => (this.aguardando = resolver));
    }
    carregarHistorico() {
        if (!(0, fs_1.existsSync)(this.caminhoHistorico))
            return [];
        // No arquivo: um comando por linha, do mais antigo para o mais recente.
        return (0, fs_1.readFileSync)(this.caminhoHistorico, 'utf8').split('\n').filter(Boolean).reverse();
    }
    salvarNoHistorico(linha) {
        if (this.historico[0] === linha)
            return;
        this.historico = [linha, ...this.historico].slice(0, Terminal.LIMITE_HISTORICO);
        (0, fs_1.mkdirSync)((0, path_1.dirname)(this.caminhoHistorico), { recursive: true });
        (0, fs_1.writeFileSync)(this.caminhoHistorico, [...this.historico].reverse().join('\n') + '\n', 'utf8');
    }
}
exports.Terminal = Terminal;
