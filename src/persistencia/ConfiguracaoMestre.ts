import { randomBytes, scryptSync } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { Credencial } from '../autenticacao/Credencial';
import { PapelUsuario } from '../enums/PapelUsuario';
import { CriptografiaArquivo } from './CriptografiaArquivo';
import { gravarAtomico } from './gravarAtomico';

/**
 * Arquivo de configuração mestre (FR12, NFR03).
 * Guarda a chave AES-256 dos dados e a credencial do primeiro administrador.
 *
 * O conteúdo é cifrado com AES-256 usando uma chave derivada da senha do
 * administrador (scrypt). Assim a chave mestra nunca fica em texto no disco,
 * e desbloquear o sistema exige a senha do administrador.
 */
export class ConfiguracaoMestre {
  public static readonly USUARIO_ADMIN = 'admin';

  private caminho: string;
  private criptografia: CriptografiaArquivo;
  private chave: string;
  private administrador: Credencial;

  private constructor(caminho: string, criptografia: CriptografiaArquivo, chave: string, administrador: Credencial) {
    this.caminho = caminho;
    this.criptografia = criptografia;
    this.chave = chave;
    this.administrador = administrador;
  }

  public static existe(caminho: string): boolean {
    return existsSync(caminho);
  }

  /** Modo de provisionamento: gera a chave mestra e cria o administrador. */
  public static provisionar(caminho: string, senhaAdmin: string, criptografia: CriptografiaArquivo): ConfiguracaoMestre {
    if (ConfiguracaoMestre.existe(caminho)) throw new Error('O sistema já foi provisionado.');
    const administrador = Credencial.criar(ConfiguracaoMestre.USUARIO_ADMIN, senhaAdmin, PapelUsuario.ADMINISTRADOR);
    const configuracao = new ConfiguracaoMestre(caminho, criptografia, criptografia.gerarChave(), administrador);
    configuracao.gravar(senhaAdmin);
    return configuracao;
  }

  /** Abre o arquivo mestre com a senha do administrador. */
  public static desbloquear(caminho: string, senhaAdmin: string, criptografia: CriptografiaArquivo): ConfiguracaoMestre {
    const arquivo = JSON.parse(readFileSync(caminho, 'utf8'));
    const chaveDerivada = ConfiguracaoMestre.derivarChave(senhaAdmin, arquivo.salt);
    let conteudo: any;
    try {
      conteudo = JSON.parse(criptografia.decifrar(arquivo.dados, chaveDerivada));
    } catch {
      throw new Error('Senha do administrador incorreta ou arquivo mestre corrompido.');
    }
    return new ConfiguracaoMestre(caminho, criptografia, conteudo.chave, Credencial.reconstruir(conteudo.administrador));
  }

  /** Troca a senha do administrador e cifra o arquivo mestre novamente. */
  public alterarSenhaAdministrador(senhaNova: string): void {
    this.administrador = Credencial.criar(this.administrador.getUsuario(), senhaNova, PapelUsuario.ADMINISTRADOR);
    this.gravar(senhaNova);
  }

  public getChave(): string {
    return this.chave;
  }

  public getAdministrador(): Credencial {
    return this.administrador;
  }

  private gravar(senhaAdmin: string): void {
    const salt = randomBytes(16).toString('hex');
    const conteudo = JSON.stringify({ chave: this.chave, administrador: this.administrador });
    const dados = this.criptografia.cifrar(conteudo, ConfiguracaoMestre.derivarChave(senhaAdmin, salt));
    gravarAtomico(this.caminho, JSON.stringify({ versao: 1, salt, dados }, null, 2));
  }

  /** scrypt: derivação de chave lenta de propósito, dificultando ataques de força bruta. */
  private static derivarChave(senha: string, salt: string): string {
    return scryptSync(senha, salt, 32).toString('hex');
  }
}
