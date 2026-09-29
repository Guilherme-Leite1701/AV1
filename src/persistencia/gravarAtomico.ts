import { mkdirSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';

/**
 * Grava primeiro num arquivo temporário e depois renomeia.
 * Se o programa for interrompido no meio, o arquivo anterior continua íntegro.
 */
export function gravarAtomico(caminho: string, conteudo: string): void {
  mkdirSync(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.tmp`;
  writeFileSync(temporario, conteudo, 'utf8');
  renameSync(temporario, caminho);
}
