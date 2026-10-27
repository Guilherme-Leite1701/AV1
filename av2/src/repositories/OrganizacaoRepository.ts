import { Contrato as LinhaContrato, Prisma, PrismaClient } from '@prisma/client';
import { Contrato } from '../domain/entidades/Contrato';
import { Organizacao } from '../domain/entidades/Organizacao';
import { ClienteBD, verificarLockOtimista } from './infra';

type LinhaOrganizacao = Prisma.OrganizacaoGetPayload<{ include: { contratoVigente: true } }>;

export interface DadosNovaOrganizacao {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
}

export interface DadosNovoContrato {
  dataAssinatura: Date;
  dataVencimento: Date;
  clausulas: string[];
  valorMensal: number;
  renovacaoAutomatica: boolean;
}

/** Agregado Organização + Contrato (cláusulas em JSONB ↔ string[]). */
export class OrganizacaoRepository {
  private static readonly INCLUIR = { contratoVigente: true } as const;

  constructor(private readonly prisma: PrismaClient) {}

  public static contratoParaDominio(linha: LinhaContrato): Contrato {
    const clausulas = Array.isArray(linha.clausulas)
      ? linha.clausulas.filter((c): c is string => typeof c === 'string')
      : [];
    return new Contrato({ ...linha, clausulas });
  }

  private static paraDominio(linha: LinhaOrganizacao): Organizacao {
    const { contratoVigente, ...dados } = linha;
    return new Organizacao(dados, contratoVigente ? OrganizacaoRepository.contratoParaDominio(contratoVigente) : null);
  }

  public async buscarPorId(id: string, tx: ClienteBD = this.prisma): Promise<Organizacao | null> {
    const linha = await tx.organizacao.findUnique({ where: { id }, include: OrganizacaoRepository.INCLUIR });
    return linha ? OrganizacaoRepository.paraDominio(linha) : null;
  }

  public async existeCnpj(cnpj: string, tx: ClienteBD = this.prisma): Promise<boolean> {
    return (await tx.organizacao.count({ where: { cnpj } })) > 0;
  }

  public async listar(filtros: { apenasAtivas: boolean }, tx: ClienteBD = this.prisma): Promise<Organizacao[]> {
    const linhas = await tx.organizacao.findMany({
      where: filtros.apenasAtivas ? { ativo: true } : undefined,
      include: OrganizacaoRepository.INCLUIR,
      orderBy: { razaoSocial: 'asc' },
    });
    return linhas.map(OrganizacaoRepository.paraDominio);
  }

  public async criarComContrato(
    organizacao: DadosNovaOrganizacao,
    contrato: DadosNovoContrato,
    tx: ClienteBD = this.prisma,
  ): Promise<Organizacao> {
    const linha = await tx.organizacao.create({
      data: { ...organizacao, contratoVigente: { create: contrato } },
      include: OrganizacaoRepository.INCLUIR,
    });
    return OrganizacaoRepository.paraDominio(linha);
  }

  /** Optimistic locking: só grava se a versão ainda for `versaoEsperada`. */
  public async atualizar(
    id: string,
    versaoEsperada: number,
    dados: { enderecoCompleto?: string; ativo?: boolean },
    tx: ClienteBD = this.prisma,
  ): Promise<Organizacao> {
    const { count } = await tx.organizacao.updateMany({
      where: { id, versao: versaoEsperada },
      data: { ...dados, versao: { increment: 1 } },
    });
    await verificarLockOtimista(count, {
      entidade: 'Organizacao',
      id,
      versaoEsperada,
      existe: async () => (await tx.organizacao.count({ where: { id } })) > 0,
    });
    return (await this.buscarPorId(id, tx)) as Organizacao;
  }

  public async atualizarVencimentoContrato(
    contratoId: string,
    versaoEsperada: number,
    novoVencimento: Date,
    tx: ClienteBD = this.prisma,
  ): Promise<Contrato> {
    const { count } = await tx.contrato.updateMany({
      where: { id: contratoId, versao: versaoEsperada },
      data: { dataVencimento: novoVencimento, versao: { increment: 1 } },
    });
    await verificarLockOtimista(count, {
      entidade: 'Contrato',
      id: contratoId,
      versaoEsperada,
      existe: async () => (await tx.contrato.count({ where: { id: contratoId } })) > 0,
    });
    const linha = await tx.contrato.findUniqueOrThrow({ where: { id: contratoId } });
    return OrganizacaoRepository.contratoParaDominio(linha);
  }

  public async listarContratosDeOrganizacoesAtivas(
    tx: ClienteBD = this.prisma,
  ): Promise<{ contrato: Contrato; razaoSocial: string }[]> {
    const linhas = await tx.contrato.findMany({
      where: { organizacao: { ativo: true } },
      include: { organizacao: { select: { razaoSocial: true } } },
    });
    return linhas.map(({ organizacao, ...contrato }) => ({
      contrato: OrganizacaoRepository.contratoParaDominio(contrato),
      razaoSocial: organizacao.razaoSocial,
    }));
  }
}
