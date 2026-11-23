import { ChaveApi as LinhaChaveApi, PrismaClient } from '@prisma/client';
import { ChaveApi } from '../domain/entidades/ChaveApi';
import { EscopoApi } from '../domain/enums/EscopoApi';
import { ClienteBD, verificarLockOtimista } from './infra';

export interface DadosCriacaoChave {
  nome: string;
  prefixo: string;
  hashChave: string;
  segredoWebhook: string;
  escopos: EscopoApi[];
  organizacaoId: string | null;
  limitePorMinuto: number;
  expiraEm: Date | null;
  criadaPor: string;
}

export class ChaveApiRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public static paraDominio(linha: LinhaChaveApi): ChaveApi {
    return new ChaveApi({ ...linha, escopos: linha.escopos as EscopoApi[] });
  }

  public async criar(dados: DadosCriacaoChave, tx: ClienteBD = this.prisma): Promise<ChaveApi> {
    return ChaveApiRepository.paraDominio(await tx.chaveApi.create({ data: dados }));
  }

  /** Busca pelo hash (índice único): é o caminho de toda requisição da API pública. */
  public async buscarPorHash(hashChave: string, tx: ClienteBD = this.prisma): Promise<ChaveApi | null> {
    const linha = await tx.chaveApi.findUnique({ where: { hashChave } });
    return linha ? ChaveApiRepository.paraDominio(linha) : null;
  }

  public async buscarPorId(id: string, tx: ClienteBD = this.prisma): Promise<ChaveApi | null> {
    const linha = await tx.chaveApi.findUnique({ where: { id } });
    return linha ? ChaveApiRepository.paraDominio(linha) : null;
  }

  public async listar(filtro: { organizacaoId?: string; incluirRevogadas: boolean }, tx: ClienteBD = this.prisma): Promise<ChaveApi[]> {
    const linhas = await tx.chaveApi.findMany({
      where: { organizacaoId: filtro.organizacaoId, revogadaEm: filtro.incluirRevogadas ? undefined : null },
      orderBy: { criadaEm: 'desc' },
    });
    return linhas.map(ChaveApiRepository.paraDominio);
  }

  /** Revoga com optimistic locking (a revogação é definitiva). */
  public async revogar(id: string, versaoEsperada: number, agora: Date, tx: ClienteBD = this.prisma): Promise<ChaveApi> {
    const { count } = await tx.chaveApi.updateMany({
      where: { id, versao: versaoEsperada },
      data: { ativa: false, revogadaEm: agora, versao: { increment: 1 } },
    });
    await verificarLockOtimista(count, {
      entidade: 'ChaveApi',
      id,
      versaoEsperada,
      existe: async () => (await tx.chaveApi.count({ where: { id } })) > 0,
    });
    return ChaveApiRepository.paraDominio(await tx.chaveApi.findUniqueOrThrow({ where: { id } }));
  }

  /** Atualiza o último uso sem mexer na versão (é telemetria, não alteração de negócio). */
  public async registrarUso(id: string, agora: Date, tx: ClienteBD = this.prisma): Promise<void> {
    await tx.chaveApi.update({ where: { id }, data: { ultimoUsoEm: agora } });
  }
}
