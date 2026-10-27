import '@fastify/jwt';
import { FastifyRequest } from 'fastify';
import { ErroNaoAutenticado } from '../domain/erros/ErrosAplicacao';
import { UsuarioAutenticado } from '../services/tipos';

/** Tipagem do payload do token e de `request.user`. */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UsuarioAutenticado;
    user: UsuarioAutenticado;
  }
}

/** Valida o Bearer token (assinatura e expiração) e preenche `request.user`. */
export async function autenticarJWT(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      throw new ErroNaoAutenticado('Token expirado (validade de 30 minutos). Faça login novamente.');
    }
    if (codigo === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      throw new ErroNaoAutenticado('Envie o cabeçalho "Authorization: Bearer <token>". Obtenha o token em POST /auth/login.');
    }
    throw new ErroNaoAutenticado('Token inválido.');
  }
}
