import { randomUUID } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'fs';
import { dirname, join, parse } from 'path';
import { CriptografiaArquivo } from './CriptografiaArquivo';

/**
 * Entrada do journal de transações (FR07, NFR04).
 * Cada operação é registrada (cifrada, uma por linha) ANTES de ser aplicada aos dados.
 * - Rotação: ao passar de 10 MB, o arquivo atual é renomeado com data e hora.
 * - Retenção: arquivos rotacionados são mantidos por pelo menos 180 dias.
 */
export class JournalTransacao {
  public static TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;
  public static RETENCAO_DIAS = 180;

  private static caminhoArquivo = join('dados', 'journal.log');
  private static criptografia: CriptografiaArquivo | null = null;
  private static chave = '';

  private id: string;
  private timestamp: Date;
  private operacao: string;
  private entidade: string;
  private dadosAntes: any;
  private dadosDepois: any;
  private usuarioResponsavel: string;

  constructor(operacao: string, entidade: string, dadosAntes: any, dadosDepois: any, usuarioResponsavel: string) {
    this.id = randomUUID();
    this.timestamp = new Date();
    this.operacao = operacao;
    this.entidade = entidade;
    this.dadosAntes = dadosAntes ?? null;
    this.dadosDepois = dadosDepois ?? null;
    this.usuarioResponsavel = usuarioResponsavel;
  }

  /** Define onde e com qual chave o journal é gravado. Chamado uma vez na inicialização. */
  public static configurar(caminho: string, criptografia: CriptografiaArquivo, chave: string): void {
    JournalTransacao.caminhoArquivo = caminho;
    JournalTransacao.criptografia = criptografia;
    JournalTransacao.chave = chave;
  }

  public registrar(): void {
    const criptografia = JournalTransacao.obterCriptografia();
    JournalTransacao.rotacionarSeNecessario();
    mkdirSync(dirname(JournalTransacao.caminhoArquivo), { recursive: true });
    appendFileSync(
      JournalTransacao.caminhoArquivo,
      criptografia.cifrar(JSON.stringify(this), JournalTransacao.chave) + '\n',
      'utf8',
    );
  }

  /**
   * Registra uma transação de compensação (antes e depois invertidos).
   * Restaurar a entidade em si fica a cargo de quem chama, usando `getDadosAntes()`.
   */
  public reverter(): boolean {
    if (this.dadosAntes === null && this.dadosDepois === null) return false;
    new JournalTransacao(
      `REVERSAO:${this.operacao}`,
      this.entidade,
      this.dadosDepois,
      this.dadosAntes,
      this.usuarioResponsavel,
    ).registrar();
    return true;
  }

  /** Lê as últimas entradas do journal atual, já decifradas (consulta do Auditor). */
  public static lerUltimas(quantidade: number): any[] {
    const criptografia = JournalTransacao.obterCriptografia();
    if (!existsSync(JournalTransacao.caminhoArquivo)) return [];
    return readFileSync(JournalTransacao.caminhoArquivo, 'utf8')
      .split('\n')
      .filter((linha) => linha.trim() !== '')
      .slice(-quantidade)
      .map((linha) => JSON.parse(criptografia.decifrar(linha, JournalTransacao.chave)));
  }

  private static obterCriptografia(): CriptografiaArquivo {
    if (!JournalTransacao.criptografia) throw new Error('Journal não configurado.');
    return JournalTransacao.criptografia;
  }

  private static rotacionarSeNecessario(): void {
    const caminho = JournalTransacao.caminhoArquivo;
    if (!existsSync(caminho) || statSync(caminho).size < JournalTransacao.TAMANHO_MAXIMO_BYTES) return;

    const { dir, name, ext } = parse(caminho);
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-'); // ":" não é permitido em nomes no Windows
    renameSync(caminho, join(dir, `${name}-${carimbo}${ext}`));

    // Retenção: só apaga arquivos rotacionados sem alteração há mais de 180 dias.
    const limite = Date.now() - JournalTransacao.RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    for (const arquivo of readdirSync(dir || '.')) {
      if (!arquivo.startsWith(`${name}-`) || !arquivo.endsWith(ext)) continue;
      const completo = join(dir, arquivo);
      if (statSync(completo).mtimeMs < limite) unlinkSync(completo);
    }
  }

  public getId(): string {
    return this.id;
  }

  public getTimestamp(): Date {
    return this.timestamp;
  }

  public getOperacao(): string {
    return this.operacao;
  }

  public getEntidade(): string {
    return this.entidade;
  }

  public getDadosAntes(): any {
    return this.dadosAntes;
  }

  public getDadosDepois(): any {
    return this.dadosDepois;
  }

  public getUsuarioResponsavel(): string {
    return this.usuarioResponsavel;
  }
}
