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

export interface Configuracao {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiracao: string;
  host: string;
  porta: number;
  nivelLog: string;
}

export function carregarConfiguracao(): Configuracao {
  return {
    databaseUrl: obrigatoria('DATABASE_URL'),
    jwtSecret: carregarSegredoJwt(),
    jwtExpiracao: '30m',
    host: process.env.HOST ?? '0.0.0.0',
    porta: Number(process.env.PORT ?? 3333),
    nivelLog: process.env.LOG_LEVEL ?? 'info',
  };
}
