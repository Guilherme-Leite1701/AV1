import { PrismaClient } from '@prisma/client';

export function criarPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient({
    datasourceUrl: databaseUrl,
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
