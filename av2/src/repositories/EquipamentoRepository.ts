import { Equipamento as LinhaEquipamento, Prisma, PrismaClient } from '@prisma/client';
import { Equipamento } from '../domain/entidades/Equipamento';
import { EstadoFisico } from '../domain/enums/EstadoFisico';
import { StatusRastreamento } from '../domain/enums/StatusRastreamento';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';
import { ClienteBD, verificarLockOtimista } from './infra';
import { FiltrosLote, LoteRepository } from './LoteRepository';

export interface DadosCriacaoEquipamento {
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  loteId: string;
  posicaoNoLote: number;
}

export interface EquipamentoComOrigem {
  equipamento: Equipamento;
  lote: { id: string; notaFiscal: string; dataEntrada: Date };
  organizacao: { id: string; razaoSocial: string };
}

export class EquipamentoRepository {
  private static readonly INCLUIR_ORIGEM = {
    lote: {
      select: { id: true, notaFiscal: true, dataEntrada: true, organizacao: { select: { id: true, razaoSocial: true } } },
    },
  } as const;

  constructor(private readonly prisma: PrismaClient) {}

  public static paraDominio(linha: LinhaEquipamento): Equipamento {
    return new Equipamento({
      ...linha,
      tipo: linha.tipo as TipoEquipamento,
      estadoFisico: linha.estadoFisico as EstadoFisico,
      statusRastreamento: linha.statusRastreamento as StatusRastreamento,
    });
  }

  public async criar(dados: DadosCriacaoEquipamento, tx: ClienteBD = this.prisma): Promise<Equipamento> {
    return EquipamentoRepository.paraDominio(await tx.equipamento.create({ data: dados }));
  }

  /** Aceita o UUID ou o código de barras. */
  public async buscarPorIdOuCodigo(idOuCodigo: string, tx: ClienteBD = this.prisma): Promise<Equipamento | null> {
    const linha = await tx.equipamento.findFirst({
      where: { OR: [{ id: idOuCodigo }, { codigoBarrasInterno: idOuCodigo }] },
    });
    return linha ? EquipamentoRepository.paraDominio(linha) : null;
  }

  public async listarPorLote(loteId: string, tx: ClienteBD = this.prisma): Promise<Equipamento[]> {
    const linhas = await tx.equipamento.findMany({ where: { loteId }, orderBy: { posicaoNoLote: 'asc' } });
    return linhas.map(EquipamentoRepository.paraDominio);
  }

  public async proximaPosicaoNoLote(loteId: string, tx: ClienteBD = this.prisma): Promise<number> {
    const { _max } = await tx.equipamento.aggregate({ where: { loteId }, _max: { posicaoNoLote: true } });
    return (_max.posicaoNoLote ?? 0) + 1;
  }

  public async listarComOrigem(
    filtros: { status?: StatusRastreamento[]; lote?: FiltrosLote },
    tx: ClienteBD = this.prisma,
  ): Promise<EquipamentoComOrigem[]> {
    const where: Prisma.EquipamentoWhereInput = {
      statusRastreamento: filtros.status ? { in: filtros.status } : undefined,
      lote: filtros.lote ? LoteRepository.montarWhere(filtros.lote) : undefined,
    };
    const linhas = await tx.equipamento.findMany({
      where,
      include: EquipamentoRepository.INCLUIR_ORIGEM,
      orderBy: [{ loteId: 'asc' }, { posicaoNoLote: 'asc' }],
    });
    return linhas.map(({ lote, ...equipamento }) => ({
      equipamento: EquipamentoRepository.paraDominio(equipamento),
      lote: { id: lote.id, notaFiscal: lote.notaFiscal, dataEntrada: lote.dataEntrada },
      organizacao: lote.organizacao,
    }));
  }

  /** Optimistic locking: só grava se a versão ainda for `versaoEsperada`. */
  public async atualizar(
    id: string,
    versaoEsperada: number,
    dados: { estadoFisico?: EstadoFisico; statusRastreamento?: StatusRastreamento },
    tx: ClienteBD = this.prisma,
  ): Promise<Equipamento> {
    const { count } = await tx.equipamento.updateMany({
      where: { id, versao: versaoEsperada },
      data: { ...dados, versao: { increment: 1 } },
    });
    await verificarLockOtimista(count, {
      entidade: 'Equipamento',
      id,
      versaoEsperada,
      existe: () => this.existe(id, tx),
    });
    return EquipamentoRepository.paraDominio(await tx.equipamento.findUniqueOrThrow({ where: { id } }));
  }

  /** A exclusão também confere a versão. */
  public async excluir(id: string, versaoEsperada: number, tx: ClienteBD = this.prisma): Promise<void> {
    const { count } = await tx.equipamento.deleteMany({ where: { id, versao: versaoEsperada } });
    await verificarLockOtimista(count, {
      entidade: 'Equipamento',
      id,
      versaoEsperada,
      existe: () => this.existe(id, tx),
    });
  }

  private async existe(id: string, tx: ClienteBD): Promise<boolean> {
    return (await tx.equipamento.count({ where: { id } })) > 0;
  }
}
