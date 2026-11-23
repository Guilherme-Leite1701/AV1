import IORedis from 'ioredis';

/**
 * Conexão do rate limit: falha rápido (1 retry, 1 s) para que um Redis fora do ar
 * não trave as requisições; com skipOnError a API segue sem limite até ele voltar.
 */
export function criarRedisLimiteTaxa(url: string): IORedis {
  return new IORedis(url, { connectTimeout: 1_000, maxRetriesPerRequest: 1, enableOfflineQueue: false });
}
