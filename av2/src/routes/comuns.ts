import { PapelUsuario } from '../domain/enums/PapelUsuario';
import { autenticarJWT } from '../middlewares/autenticarJWT';
import { exigirPapel } from '../middlewares/exigirPapel';

/** Autentica (401) e depois autoriza (403). */
export function protegida(papeis: readonly PapelUsuario[]) {
  return { onRequest: [autenticarJWT, exigirPapel(papeis)] };
}

export const autenticada = { onRequest: [autenticarJWT] };

// Fragmentos de JSON Schema

export const texto = (minLength = 1, maxLength = 500) => ({ type: 'string', minLength, maxLength }) as const;

export const versao = { type: 'integer', minimum: 1, description: 'Versão atual do registro (optimistic locking).' } as const;

export const dataTexto = {
  type: 'string',
  minLength: 10,
  maxLength: 40,
  description: 'Data ISO 8601: AAAA-MM-DD ou AAAA-MM-DDTHH:mm:ssZ',
} as const;

export const paramsId = {
  type: 'object',
  required: ['id'],
  properties: { id: texto(1, 100) },
} as const;

export const queryVersao = {
  type: 'object',
  required: ['versao'],
  properties: { versao },
} as const;

export const queryPeriodo = {
  type: 'object',
  additionalProperties: false,
  properties: { inicio: dataTexto, fim: dataTexto },
} as const;

export function corpo(propriedades: Record<string, unknown>, obrigatorios: string[]) {
  return { type: 'object', additionalProperties: false, required: obrigatorios, properties: propriedades } as const;
}
