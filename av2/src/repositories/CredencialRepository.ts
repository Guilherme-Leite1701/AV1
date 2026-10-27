import { Credencial as LinhaCredencial, PrismaClient } from '@prisma/client';
import { Credencial } from '../domain/entidades/Credencial';
import { PapelUsuario } from '../domain/enums/PapelUsuario';
import { ClienteBD, verificarLockOtimista } from './infra';

export class CredencialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private static paraDominio(linha: LinhaCredencial): Credencial {
    return new Credencial({ ...linha, papel: linha.papel as PapelUsuario });
  }

  public async buscarPorUsuario(usuario: string, tx: ClienteBD = this.prisma): Promise<Credencial | null> {
    const linha = await tx.credencial.findUnique({ where: { usuario } });
    return linha ? CredencialRepository.paraDominio(linha) : null;
  }

  public async buscarPorId(id: string, tx: ClienteBD = this.prisma): Promise<Credencial | null> {
    const linha = await tx.credencial.findUnique({ where: { id } });
    return linha ? CredencialRepository.paraDominio(linha) : null;
  }

  public async listar(tx: ClienteBD = this.prisma): Promise<Credencial[]> {
    const linhas = await tx.credencial.findMany({ orderBy: { usuario: 'asc' } });
    return linhas.map(CredencialRepository.paraDominio);
  }

  public async criar(
    dados: { usuario: string; hashSenha: string; salt: string; papel: PapelUsuario },
    tx: ClienteBD = this.prisma,
  ): Promise<Credencial> {
    const linha = await tx.credencial.create({ data: dados });
    return CredencialRepository.paraDominio(linha);
  }

  /** Não altera a versão. */
  public async registrarAcesso(id: string, quando: Date, tx: ClienteBD = this.prisma): Promise<void> {
    await tx.credencial.update({ where: { id }, data: { ultimoAcesso: quando } });
  }

  public async atualizarSenha(
    id: string,
    versaoEsperada: number,
    dados: { hashSenha: string; salt: string },
    tx: ClienteBD = this.prisma,
  ): Promise<void> {
    const { count } = await tx.credencial.updateMany({
      where: { id, versao: versaoEsperada },
      data: { ...dados, versao: { increment: 1 } },
    });
    await verificarLockOtimista(count, {
      entidade: 'Credencial',
      id,
      versaoEsperada,
      existe: async () => (await tx.credencial.count({ where: { id } })) > 0,
    });
  }
}
