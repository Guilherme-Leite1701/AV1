import { Prisma, PrismaClient } from '@prisma/client';
import { ConflitoConcorrenciaError, ErroNaoEncontrado } from '../domain/erros/ErrosAplicacao';

/** PrismaClient ou o cliente `tx` de uma transação: os repositórios aceitam os dois. */
export type ClienteBD = PrismaClient | Prisma.TransactionClient;

/** Abre uma transação; qualquer erro lançado dentro dela faz ROLLBACK. */
export class GerenciadorTransacao {
  constructor(private readonly prisma: PrismaClient) {}

  public executar<T>(trabalho: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(trabalho, {
      maxWait: 5_000,
      timeout: 15_000,
    });
  }
}

/** Nenhuma linha afetada: 409 se o registro existe (versão mudou), 404 se não existe. */
export async function verificarLockOtimista(
  linhasAfetadas: number,
  contexto: { entidade: string; id: string; versaoEsperada: number; existe: () => Promise<boolean> },
): Promise<void> {
  if (linhasAfetadas > 0) return;
  if (await contexto.existe()) {
    throw new ConflitoConcorrenciaError(contexto.entidade, contexto.id, contexto.versaoEsperada);
  }
  throw new ErroNaoEncontrado(contexto.entidade, contexto.id);
}

/** Converte qualquer objeto em JSON aceito pelo Prisma. */
export function paraJson(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined;
  return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
}
