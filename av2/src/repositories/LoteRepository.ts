import { Lote as LinhaLote, Prisma, PrismaClient } from '@prisma/client';
import { Lote } from '../domain/entidades/Lote';
import { StatusLote } from '../domain/enums/StatusLote';
import { ClienteBD, verificarLockOtimista } from './infra';

export interface FiltrosLote {
  organizacaoId?: string;
  status?: StatusLote;
  inicio?: Date;
  fim?: Date;
}

export class LoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public static paraDominio(linha: LinhaLote): Lote {
    return new Lote({ ...linha, statusProcessamento: linha.statusProcessamento as StatusLote });
  }

  public async criar(
    dados: { dataEntrada: Date; organizacaoId: string; notaFiscal: string; transportadora: string; observacoes: string },
    tx: ClienteBD = this.prisma,
  ): Promise<Lote> {
    return LoteRepository.paraDominio(await tx.lote.create({ data: dados }));
  }

  public async buscarPorId(id: string, tx: ClienteBD = this.prisma): Promise<Lote | null> {
    const linha = await tx.lote.findUnique({ where: { id } });
    return linha ? LoteRepository.paraDominio(linha) : null;
  }

  public async existeNotaFiscal(notaFiscal: string, tx: ClienteBD = this.prisma): Promise<boolean> {
    return (await tx.lote.count({ where: { notaFiscal } })) > 0;
  }

  public async listar(
    filtros: FiltrosLote,
    tx: ClienteBD = this.prisma,
  ): Promise<{ lote: Lote; quantidadeEquipamentos: number; pesoTotal: number }[]> {
    const linhas = await tx.lote.findMany({
      where: LoteRepository.montarWhere(filtros),
      include: { equipamentos: { select: { pesoQuilogramas: true } } },
      orderBy: { dataEntrada: 'desc' },
    });
    return linhas.map(({ equipamentos, ...lote }) => ({
      lote: LoteRepository.paraDominio(lote),
      quantidadeEquipamentos: equipamentos.length,
      pesoTotal: Lote.calcularPesoTotal(equipamentos),
    }));
  }

  public static montarWhere(filtros: FiltrosLote): Prisma.LoteWhereInput {
    return {
      organizacaoId: filtros.organizacaoId,
      statusProcessamento: filtros.status,
      dataEntrada: filtros.inicio || filtros.fim ? { gte: filtros.inicio, lte: filtros.fim } : undefined,
    };
  }

  /** Com optimistic locking. */
  public async atualizarStatus(
    id: string,
    versaoEsperada: number,
    status: StatusLote,
    tx: ClienteBD = this.prisma,
  ): Promise<Lote> {
    const { count } = await tx.lote.updateMany({
      where: { id, versao: versaoEsperada },
      data: { statusProcessamento: status, versao: { increment: 1 } },
    });
    await verificarLockOtimista(count, {
      entidade: 'Lote',
      id,
      versaoEsperada,
      existe: async () => (await tx.lote.count({ where: { id } })) > 0,
    });
    return (await this.buscarPorId(id, tx)) as Lote;
  }
}
