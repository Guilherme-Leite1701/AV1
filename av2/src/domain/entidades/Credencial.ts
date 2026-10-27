import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PapelUsuario } from '../enums/PapelUsuario';
import { ErroValidacao } from '../erros/ErrosAplicacao';

export interface PropsCredencial {
  id: string;
  usuario: string;
  hashSenha: string;
  salt: string;
  ultimoAcesso: Date | null;
  papel: PapelUsuario;
  versao: number;
}

/** A senha é guardada como SHA-256(salt + senha). */
export class Credencial {
  public static readonly TAMANHO_MINIMO_SENHA = 8;
  private static readonly PADRAO_USUARIO = /^[a-zA-Z0-9._-]{3,30}$/;

  private props: PropsCredencial;

  constructor(props: PropsCredencial) {
    this.props = { ...props };
  }

  public static gerarDados(
    usuario: string,
    senhaPlana: string,
    papel: PapelUsuario,
  ): Pick<PropsCredencial, 'usuario' | 'hashSenha' | 'salt' | 'papel'> {
    if (!Credencial.PADRAO_USUARIO.test(usuario)) {
      throw new ErroValidacao('Usuário deve ter de 3 a 30 caracteres (letras, números, ".", "_" ou "-").');
    }
    const { hashSenha, salt } = Credencial.gerarHashComSalt(senhaPlana);
    return { usuario, hashSenha, salt, papel };
  }

  public static gerarHashComSalt(senhaPlana: string): { hashSenha: string; salt: string } {
    if (typeof senhaPlana !== 'string' || senhaPlana.length < Credencial.TAMANHO_MINIMO_SENHA) {
      throw new ErroValidacao(`A senha deve ter pelo menos ${Credencial.TAMANHO_MINIMO_SENHA} caracteres.`);
    }
    const salt = randomBytes(16).toString('hex');
    return { hashSenha: Credencial.gerarHash(senhaPlana, salt), salt };
  }

  public verificarSenha(senhaPlana: string): boolean {
    const calculado = Buffer.from(Credencial.gerarHash(senhaPlana, this.props.salt), 'hex');
    const armazenado = Buffer.from(this.props.hashSenha, 'hex');
    return calculado.length === armazenado.length && timingSafeEqual(calculado, armazenado);
  }

  private static gerarHash(senhaPlana: string, salt: string): string {
    return createHash('sha256').update(salt + senhaPlana).digest('hex');
  }

  public get id(): string {
    return this.props.id;
  }
  public get usuario(): string {
    return this.props.usuario;
  }
  public get papel(): PapelUsuario {
    return this.props.papel;
  }
  public get ultimoAcesso(): Date | null {
    return this.props.ultimoAcesso;
  }
  public get versao(): number {
    return this.props.versao;
  }

  /** Sem hash nem salt. */
  public paraVisaoPublica(): { id: string; usuario: string; papel: PapelUsuario; ultimoAcesso: Date | null } {
    return {
      id: this.props.id,
      usuario: this.props.usuario,
      papel: this.props.papel,
      ultimoAcesso: this.props.ultimoAcesso,
    };
  }
}
