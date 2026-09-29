import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PapelUsuario } from '../enums/PapelUsuario';

/**
 * Credencial de acesso de um usuário.
 * A senha nunca é guardada em texto: armazena-se SHA-256(salt + senha) (NFR01).
 */
export class Credencial {
  private usuario: string;
  private hashSenha: string;
  private salt: string;
  private ultimoAcesso: Date;
  private papel: PapelUsuario;

  constructor(usuario: string, hashSenha: string, salt: string, ultimoAcesso: Date, papel: PapelUsuario) {
    this.usuario = usuario;
    this.hashSenha = hashSenha;
    this.salt = salt;
    this.ultimoAcesso = ultimoAcesso;
    this.papel = papel;
  }

  public static readonly TAMANHO_MINIMO_SENHA = 8;

  /** Cria uma credencial nova a partir da senha em texto, gerando um salt aleatório. */
  public static criar(usuario: string, senhaPlana: string, papel: PapelUsuario): Credencial {
    if (!/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) {
      throw new Error('Usuário deve ter de 3 a 30 caracteres (letras, números, ".", "_" ou "-").');
    }
    if (senhaPlana.length < Credencial.TAMANHO_MINIMO_SENHA) {
      throw new Error(`A senha deve ter pelo menos ${Credencial.TAMANHO_MINIMO_SENHA} caracteres.`);
    }
    const salt = randomBytes(16).toString('hex');
    return new Credencial(usuario, Credencial.gerarHash(senhaPlana, salt), salt, new Date(), papel);
  }

  /** Recria uma Credencial a partir dos dados lidos do arquivo. */
  public static reconstruir(dados: any): Credencial {
    return new Credencial(dados.usuario, dados.hashSenha, dados.salt, new Date(dados.ultimoAcesso), dados.papel);
  }

  public verificarSenha(senhaPlana: string): boolean {
    const calculado = Buffer.from(Credencial.gerarHash(senhaPlana, this.salt), 'hex');
    const armazenado = Buffer.from(this.hashSenha, 'hex');
    // timingSafeEqual evita que o tempo de comparação revele quantos bytes coincidem.
    return calculado.length === armazenado.length && timingSafeEqual(calculado, armazenado);
  }

  public atualizarUltimoAcesso(): void {
    this.ultimoAcesso = new Date();
  }

  public getUsuario(): string {
    return this.usuario;
  }

  public getPapel(): PapelUsuario {
    return this.papel;
  }

  public getUltimoAcesso(): Date {
    return this.ultimoAcesso;
  }

  private static gerarHash(senhaPlana: string, salt: string): string {
    return createHash('sha256').update(salt + senhaPlana).digest('hex');
  }
}
