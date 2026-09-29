/**
 * Contrato de autenticação (Fase 1: a interface do usuário).
 * Implementado pela classe abstrata Usuario, base dos quatro papéis.
 */
export interface Autenticavel {
  autenticar(usuario: string, senha: string): boolean;
  renovarToken(): string;
}
