import { randomBytes } from 'crypto';
import { PapelUsuario } from '../enums/PapelUsuario';
import { Credencial } from './Credencial';

/**
 * Sessão de um usuário autenticado.
 * Expira após 30 minutos sem atividade (NFR02); cada `renovar()` reinicia a contagem.
 */
export class Sessao {
  public static readonly TEMPO_INATIVIDADE_MS = 30 * 60 * 1000;

  private token: string;
  private usuario: string;
  private papel: PapelUsuario;
  private criacao: Date;
  private expiracao: Date;

  constructor(credencial: Credencial) {
    this.token = randomBytes(32).toString('hex');
    this.usuario = credencial.getUsuario();
    this.papel = credencial.getPapel();
    this.criacao = new Date();
    this.expiracao = new Date(this.criacao.getTime() + Sessao.TEMPO_INATIVIDADE_MS);
  }

  public isValida(): boolean {
    return Date.now() < this.expiracao.getTime();
  }

  public renovar(): void {
    if (!this.isValida()) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    this.expiracao = new Date(Date.now() + Sessao.TEMPO_INATIVIDADE_MS);
  }

  public getToken(): string {
    return this.token;
  }

  public getUsuario(): string {
    return this.usuario;
  }

  public getPapel(): PapelUsuario {
    return this.papel;
  }

  public getCriacao(): Date {
    return this.criacao;
  }

  public getExpiracao(): Date {
    return this.expiracao;
  }
}
