import { defineConfig } from 'vitest/config';
import { JWT_SECRET_TESTES, obterUrlTeste } from './tests/integracao/urlTeste';

/** Requer o banco rodando (npm run db:up). */
export default defineConfig({
  test: {
    include: ['tests/integracao/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/integracao/globalSetup.ts'],
    env: {
      DATABASE_URL: obterUrlTeste(),
      JWT_SECRET: JWT_SECRET_TESTES,
    },
    // Os arquivos compartilham o schema: um por vez.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
