try {
  process.loadEnvFile();
} catch {
  // sem .env: usa as variáveis do ambiente
}

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ${nome} não definida. Copie .env.example para .env e preencha.`);
  }
  return valor;
}

function carregarSegredoJwt(): string {
  const segredo = obrigatoria('JWT_SECRET');
  if (segredo.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
  }
  return segredo;
}

/** "true"/"1"/"sim" viram true; ausente usa o padrão. */
function booleana(nome: string, padrao: boolean): boolean {
  const valor = process.env[nome]?.trim().toLowerCase();
  if (valor === undefined || valor === '') return padrao;
  return ['true', '1', 'sim', 'yes'].includes(valor);
}

export interface Configuracao {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiracao: string;
  host: string;
  porta: number;
  nivelLog: string;
  // AV3
  /** Sem REDIS_URL a fila é em memória e o worker roda dentro do servidor. */
  redisUrl: string | null;
  workerEmbutido: boolean;
  concorrenciaWorker: number;
  cronAnalises: string;
  cronLimpeza: string;
  documentacao: boolean;
  permitirWebhookHttp: boolean;
}

export function carregarConfiguracao(): Configuracao {
  const redisUrl = process.env.REDIS_URL?.trim() || null;
  return {
    databaseUrl: obrigatoria('DATABASE_URL'),
    jwtSecret: carregarSegredoJwt(),
    jwtExpiracao: '30m',
    host: process.env.HOST ?? '0.0.0.0',
    porta: Number(process.env.PORT ?? 3333),
    nivelLog: process.env.LOG_LEVEL ?? 'info',
    redisUrl,
    // Fila em memória só funciona no mesmo processo: nesse caso o worker é sempre embutido.
    workerEmbutido: redisUrl ? booleana('WORKER_EMBUTIDO', true) : true,
    concorrenciaWorker: Math.max(1, Number(process.env.WORKER_CONCORRENCIA ?? 2)),
    cronAnalises: process.env.CRON_ANALISES ?? '0 2 * * *',
    cronLimpeza: process.env.CRON_LIMPEZA ?? '15 * * * *',
    documentacao: booleana('SWAGGER_HABILITADO', true),
    permitirWebhookHttp: booleana('WEBHOOK_PERMITIR_HTTP', false),
  };
}
