import { PrismaClient } from '@prisma/client';
import { ClienteBD } from './infra';

/** Contador atômico: o upsert vira um único INSERT ... ON CONFLICT DO UPDATE. */
export class ContadorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async proximoValor(chave: string, tx: ClienteBD = this.prisma): Promise<number> {
    const contador = await tx.contadorSequencial.upsert({
      where: { chave },
      create: { chave, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return contador.valor;
  }
}
