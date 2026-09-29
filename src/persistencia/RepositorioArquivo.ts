import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { CriptografiaArquivo } from './CriptografiaArquivo';
import { gravarAtomico } from './gravarAtomico';
import { JournalTransacao } from './JournalTransacao';

/**
 * Persistência em arquivos cifrados com AES-256 (NFR03, NFR04).
 * Cada `nomeArquivo` (ex.: "organizacoes") vira um arquivo `<nome>.dat`
 * com a lista de entidades em JSON, cifrada.
 * Toda alteração passa antes pelo journal (write-ahead log).
 */
export class RepositorioArquivo {
  private diretorioBase: string;
  private criptografia: CriptografiaArquivo;
  private chave: string;
  /** Usuário registrado no journal como responsável pelas alterações. */
  private usuarioAtual: string = 'sistema';

  constructor(diretorioBase: string, criptografia: CriptografiaArquivo, chave: string) {
    this.diretorioBase = diretorioBase;
    this.criptografia = criptografia;
    this.chave = chave;
  }

  public definirUsuario(usuario: string): void {
    this.usuarioAtual = usuario;
  }

  /** Insere a entidade ou, se já existir uma com o mesmo `id`, substitui. */
  public salvarEntidade(nomeArquivo: string, entidade: any): void {
    // Converte o objeto (com campos privados) em dados puros de JSON.
    const registro = JSON.parse(JSON.stringify(entidade));
    if (!registro?.id) throw new Error('A entidade precisa ter um id para ser salva.');

    const lista = this.lerArquivo(nomeArquivo);
    const indice = lista.findIndex((e) => e.id === registro.id);
    const antes = indice >= 0 ? lista[indice] : null;

    new JournalTransacao(antes ? 'ALTERAR' : 'CRIAR', nomeArquivo, antes, registro, this.usuarioAtual).registrar();

    if (indice >= 0) {
      lista[indice] = registro;
    } else {
      lista.push(registro);
    }
    this.gravarArquivo(nomeArquivo, lista);
  }

  /** Devolve os dados puros da entidade, ou `null` se não existir. */
  public carregarEntidade(nomeArquivo: string, id: string): any {
    return this.lerArquivo(nomeArquivo).find((e) => e.id === id) ?? null;
  }

  public listarEntidades(nomeArquivo: string): any[] {
    return this.lerArquivo(nomeArquivo);
  }

  public excluirEntidade(nomeArquivo: string, id: string): void {
    const lista = this.lerArquivo(nomeArquivo);
    const antes = lista.find((e) => e.id === id);
    if (!antes) throw new Error(`Registro ${id} não encontrado em ${nomeArquivo}.`);

    new JournalTransacao('EXCLUIR', nomeArquivo, antes, null, this.usuarioAtual).registrar();
    this.gravarArquivo(nomeArquivo, lista.filter((e) => e.id !== id));
  }

  private caminho(nomeArquivo: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(nomeArquivo)) {
      throw new Error(`Nome de arquivo inválido: ${nomeArquivo}`);
    }
    return join(this.diretorioBase, `${nomeArquivo}.dat`);
  }

  private lerArquivo(nomeArquivo: string): any[] {
    const caminho = this.caminho(nomeArquivo);
    if (!existsSync(caminho)) return [];
    return JSON.parse(this.criptografia.decifrar(readFileSync(caminho, 'utf8'), this.chave));
  }

  private gravarArquivo(nomeArquivo: string, lista: any[]): void {
    gravarAtomico(this.caminho(nomeArquivo), this.criptografia.cifrar(JSON.stringify(lista), this.chave));
  }
}
