import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import * as readline from 'readline';

/**
 * Entrada e saída do terminal sobre a biblioteca readline:
 * - histórico de comandos persistente entre sessões;
 * - autocompletar com a tecla Tab;
 * - leitura de senha sem mostrar o que é digitado.
 */
export class Terminal {
  private static readonly LIMITE_HISTORICO = 200;

  private rl: readline.Interface;
  private caminhoHistorico: string;
  private historico: string[];
  private completar: (linha: string) => string[] = () => [];

  // As linhas chegam por eventos; esta fila as entrega uma de cada vez, na ordem.
  private fila: string[] = [];
  private aguardando: ((linha: string | null) => void) | null = null;
  private fechado = false;
  private silenciado = false;

  constructor(caminhoHistorico: string) {
    this.caminhoHistorico = caminhoHistorico;
    this.historico = this.carregarHistorico();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      history: [...this.historico],
      historySize: Terminal.LIMITE_HISTORICO,
      completer: (linha: string): [string[], string] => {
        const opcoes = this.completar(linha);
        const encontrados = opcoes.filter((o) => o.startsWith(linha));
        return [encontrados.length > 0 ? encontrados : opcoes, linha];
      },
    });

    // Enquanto `silenciado`, o readline não ecoa o que é digitado (senhas).
    const interno = this.rl as any;
    const escreverOriginal = interno._writeToOutput.bind(interno);
    interno._writeToOutput = (texto: string) => {
      if (!this.silenciado) escreverOriginal(texto);
    };

    this.rl.on('line', (linha) => this.entregar(linha));
    this.rl.on('close', () => {
      this.fechado = true;
      this.entregar(null);
    });
  }

  /** Define as sugestões do Tab (muda conforme o papel do usuário logado). */
  public definirCompletar(funcao: (linha: string) => string[]): void {
    this.completar = funcao;
  }

  /** Lê um comando. Retorna `null` quando a entrada termina (Ctrl+D / fim do arquivo). */
  public async lerComando(prompt: string): Promise<string | null> {
    this.rl.setPrompt(prompt);
    this.rl.prompt();
    const linha = await this.proximaLinha();
    if (linha && linha.trim()) this.salvarNoHistorico(linha.trim());
    return linha;
  }

  /** Lê uma senha sem exibi-la e sem guardá-la no histórico. */
  public async lerSenha(pergunta: string): Promise<string | null> {
    process.stdout.write(pergunta);
    this.silenciado = true;
    const linha = await this.proximaLinha();
    this.silenciado = false;
    process.stdout.write('\n');

    // Remove a senha do histórico em memória do readline (setas ↑/↓).
    const historicoInterno: string[] | undefined = (this.rl as any).history;
    if (historicoInterno && linha && historicoInterno[0] === linha) historicoInterno.shift();
    return linha;
  }

  public fechar(): void {
    this.rl.close();
  }

  private entregar(linha: string | null): void {
    if (this.aguardando) {
      const resolver = this.aguardando;
      this.aguardando = null;
      resolver(linha);
    } else if (linha !== null) {
      this.fila.push(linha);
    }
  }

  private proximaLinha(): Promise<string | null> {
    if (this.fila.length > 0) return Promise.resolve(this.fila.shift() as string);
    if (this.fechado) return Promise.resolve(null);
    return new Promise((resolver) => (this.aguardando = resolver));
  }

  private carregarHistorico(): string[] {
    if (!existsSync(this.caminhoHistorico)) return [];
    // No arquivo: um comando por linha, do mais antigo para o mais recente.
    return readFileSync(this.caminhoHistorico, 'utf8').split('\n').filter(Boolean).reverse();
  }

  private salvarNoHistorico(linha: string): void {
    if (this.historico[0] === linha) return;
    this.historico = [linha, ...this.historico].slice(0, Terminal.LIMITE_HISTORICO);
    mkdirSync(dirname(this.caminhoHistorico), { recursive: true });
    writeFileSync(this.caminhoHistorico, [...this.historico].reverse().join('\n') + '\n', 'utf8');
  }
}
