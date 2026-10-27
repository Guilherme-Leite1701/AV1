import { ParametroGlobal, PrismaClient } from '@prisma/client';
import { ClienteBD } from './infra';

export class ParametroRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public listar(tx: ClienteBD = this.prisma): Promise<ParametroGlobal[]> {
    return tx.parametroGlobal.findMany({ orderBy: { chave: 'asc' } });
  }

  public buscarPorChave(chave: string, tx: ClienteBD = this.prisma): Promise<ParametroGlobal | null> {
    return tx.parametroGlobal.findUnique({ where: { chave } });
  }

  public atualizarValor(chave: string, valorNumerico: number, tx: ClienteBD = this.prisma): Promise<ParametroGlobal> {
    return tx.parametroGlobal.update({ where: { chave }, data: { valorNumerico } });
  }

  public async obterValores<K extends string>(
    padroes: Record<K, number>,
    tx: ClienteBD = this.prisma,
  ): Promise<Record<K, number>> {
    const chaves = Object.keys(padroes) as K[];
    const linhas = await tx.parametroGlobal.findMany({ where: { chave: { in: chaves } } });
    const resultado = { ...padroes };
    for (const linha of linhas) resultado[linha.chave as K] = linha.valorNumerico;
    return resultado;
  }
}
