import { execSync } from 'node:child_process';
import { obterUrlTeste } from './urlTeste';

/** Aplica as migrations no schema de testes. */
export default function prepararBancoDeTestes(): void {
  const url = obterUrlTeste();
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
