/** Os testes usam o schema "testes" (ou DATABASE_URL_TESTE), nunca o principal. */
export const SCHEMA_TESTES = 'testes';

export function obterUrlTeste(): string {
  try {
    process.loadEnvFile();
  } catch {
    /* sem .env */
  }
  if (process.env.DATABASE_URL_TESTE) return process.env.DATABASE_URL_TESTE;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Defina DATABASE_URL (ou DATABASE_URL_TESTE) no .env para rodar os testes de integração.');
  const url = new URL(base);
  url.searchParams.set('schema', SCHEMA_TESTES);
  return url.toString();
}

export const JWT_SECRET_TESTES = 'segredo-exclusivo-dos-testes-de-integracao-0123456789';
