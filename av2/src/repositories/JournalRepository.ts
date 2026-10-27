import { JournalTransacao, PrismaClient } from '@prisma/client';
import { ClienteBD, paraJson } from './infra';

export type OperacaoJournal =
  | 'CRIAR'
  | 'ATUALIZAR'
  | 'EXCLUIR'
  | 'DESATIVAR'
  | 'RENOVAR'
  | 'RENOVACAO_AUTOMATICA'
  | 'TRIAGEM'
  | 'ALTERAR_SENHA'
  | 'SEED';

export interface RegistroJournal {
  operacao: OperacaoJournal;
  entidade: string;
  dadosAntes?: unknown;
  dadosDepois?: unknown;
  usuarioResponsavel: string;
}

/** Auditoria: sempre chamado com o mesmo `tx` da alteração registrada. */
export class JournalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async registrar(registro: RegistroJournal, tx: ClienteBD = this.prisma): Promise<void> {
    await tx.journalTransacao.create({
      data: {
        operacao: registro.operacao,
        entidade: registro.entidade,
        dadosAntes: paraJson(registro.dadosAntes),
        dadosDepois: paraJson(registro.dadosDepois),
        usuarioResponsavel: registro.usuarioResponsavel,
      },
    });
  }

  public listar(
    filtros: { entidade?: string; usuario?: string; limite: number },
    tx: ClienteBD = this.prisma,
  ): Promise<JournalTransacao[]> {
    return tx.journalTransacao.findMany({
      where: { entidade: filtros.entidade, usuarioResponsavel: filtros.usuario },
      orderBy: { timestamp: 'desc' },
      take: filtros.limite,
    });
  }
}
