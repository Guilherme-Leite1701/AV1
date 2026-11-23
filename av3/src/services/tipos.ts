import { PapelUsuario } from '../domain/enums/PapelUsuario';

/** Usuário extraído do token JWT. */
export interface UsuarioAutenticado {
  id: string;
  usuario: string;
  papel: PapelUsuario;
}

export interface Periodo {
  inicio: Date;
  fim: Date;
}

/** Relógio injetável (fixo nos testes). */
export type Relogio = () => Date;
export const relogioDoSistema: Relogio = () => new Date();

/** AV3: quem executa a operação (usuário do JWT ou parceiro da API pública). Só o nome vai para o journal. */
export type Ator = Pick<UsuarioAutenticado, 'usuario'>;
