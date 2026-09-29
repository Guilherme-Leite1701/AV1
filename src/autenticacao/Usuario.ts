import { PapelUsuario } from '../enums/PapelUsuario';
import { Autenticavel } from './Autenticavel';
import { Credencial } from './Credencial';
import { Sessao } from './Sessao';

/**
 * Classe base dos papéis (Fase 1: BaseUser).
 * Centraliza o que é igual para todos: verificação de senha (SHA-256, via Credencial)
 * e a sessão com expiração de 30 minutos (via Sessao).
 * Cada subclasse define apenas o que muda: as permissões.
 */
export abstract class Usuario implements Autenticavel {
  protected credencial: Credencial;
  private sessao: Sessao | null = null;

  constructor(credencial: Credencial) {
    this.credencial = credencial;
  }

  public autenticar(usuario: string, senha: string): boolean {
    if (usuario !== this.credencial.getUsuario() || !this.credencial.verificarSenha(senha)) {
      return false;
    }
    this.credencial.atualizarUltimoAcesso();
    this.sessao = new Sessao(this.credencial);
    return true;
  }

  /** Reinicia a contagem de inatividade e devolve o token da sessão. */
  public renovarToken(): string {
    if (!this.sessao) throw new Error('Usuário não autenticado.');
    this.sessao.renovar();
    return this.sessao.getToken();
  }

  /** Polimorfismo: a pergunta é a mesma, a resposta depende do papel. */
  public podeExecutar(comando: string): boolean {
    return this.permissoes().includes(comando);
  }

  /** Comandos que o papel pode executar (ex.: "lote criar"). */
  public abstract permissoes(): string[];

  public getNome(): string {
    return this.credencial.getUsuario();
  }

  public getPapel(): PapelUsuario {
    return this.credencial.getPapel();
  }

  public getSessao(): Sessao | null {
    return this.sessao;
  }
}
