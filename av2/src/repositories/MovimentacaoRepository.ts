import { PrismaClient } from '@prisma/client';
import { NovaMovimentacao, PropsMovimentacao } from '../domain/entidades/Movimentacao';
import { ClienteBD } from './infra';

export class MovimentacaoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public registrar(dados: NovaMovimentacao, tx: ClienteBD = this.prisma): Promise<PropsMovimentacao> {
    return tx.movimentacao.create({ data: dados });
  }

  public listarPorEquipamento(equipamentoId: string, tx: ClienteBD = this.prisma): Promise<PropsMovimentacao[]> {
    return tx.movimentacao.findMany({ where: { equipamentoId }, orderBy: [{ dataHora: 'asc' }, { id: 'asc' }] });
  }

  public ultimaDoEquipamento(equipamentoId: string, tx: ClienteBD = this.prisma): Promise<PropsMovimentacao | null> {
    return tx.movimentacao.findFirst({ where: { equipamentoId }, orderBy: [{ dataHora: 'desc' }, { id: 'desc' }] });
  }
}
