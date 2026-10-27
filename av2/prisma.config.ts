import { defineConfig } from 'prisma/config';

// Com prisma.config.ts o Prisma não lê o .env sozinho.
try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
