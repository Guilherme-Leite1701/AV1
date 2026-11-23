import { ExecucaoAnalise, PrevisaoVidaUtil, PrismaClient } from '@prisma/client';
import { AmostraTriagem } from '../domain/analise/AnalisadorEficiencia';
import { AmostraRentabilidade } from '../domain/analise/AnalisadorRentabilidade';
import { ModeloVidaUtil } from '../domain/analise/AnalisadorVidaUtil';
import { STATUS_RASTREAMENTO_FINAIS } from '../domain/enums/StatusRastreamento';
import { OrigemExecucao, TipoAnalise } from '../domain/enums/TipoAnalise';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';
import { EquipamentoRepository } from './EquipamentoRepository';
import { ClienteBD, paraJson } from './infra';

export interface FiltroAmostras {
  organizacaoId?: string;
  inicio?: Date;
  fim?: Date;
  /** Só equipamentos que ainda não chegaram a um destino final. */
  apenasAtivos?: boolean;
}

export interface NovaExecucao {
  tipo: TipoAnalise;
  origem: OrigemExecucao;
  solicitante: string;
  parametros: unknown;
  resultado: unknown;
  amostras: number;
  iniciadaEm: Date;
  concluidaEm: Date;
}

export type ResumoExecucao = Omit<ExecucaoAnalise, 'resultado'>;

/** Leitura das amostras para as análises e persistência dos resultados (histórico). */
export class AnaliseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Lotes com a triagem concluída no período (pela data de conclusão). */
  public async listarAmostrasTriagem(filtro: FiltroAmostras, tx: ClienteBD = this.prisma): Promise<AmostraTriagem[]> {
    const linhas = await tx.lote.findMany({
      where: {
        organizacaoId: filtro.organizacaoId,
        dataInicioTriagem: { not: null },
        dataConclusaoTriagem: { not: null, gte: filtro.inicio, lte: filtro.fim },
      },
      include: { organizacao: { select: { razaoSocial: true } }, _count: { select: { equipamentos: true } } },
      orderBy: { dataConclusaoTriagem: 'asc' },
    });
    return linhas.map((l) => ({
      loteId: l.id,
      notaFiscal: l.notaFiscal,
      organizacao: l.organizacao.razaoSocial,
      responsavel: l.responsavelTriagem,
      quantidadeEquipamentos: l._count.equipamentos,
      dataEntrada: l.dataEntrada,
      dataInicioTriagem: l.dataInicioTriagem as Date,
      dataConclusaoTriagem: l.dataConclusaoTriagem as Date,
    }));
  }

  /** Equipamentos com o ano de referência (ano de entrada do lote) para rentabilidade e vida útil. */
  public async listarAmostrasEquipamentos(filtro: FiltroAmostras, tx: ClienteBD = this.prisma): Promise<AmostraRentabilidade[]> {
    const linhas = await tx.equipamento.findMany({
      where: {
        statusRastreamento: filtro.apenasAtivos ? { notIn: [...STATUS_RASTREAMENTO_FINAIS] } : undefined,
        lote: {
          organizacaoId: filtro.organizacaoId,
          dataEntrada: filtro.inicio || filtro.fim ? { gte: filtro.inicio, lte: filtro.fim } : undefined,
        },
      },
      include: { lote: { select: { dataEntrada: true } } },
      orderBy: [{ tipo: 'asc' }, { codigoBarrasInterno: 'asc' }],
    });
    return linhas.map(({ lote, ...equipamento }) => ({
      equipamento: EquipamentoRepository.paraDominio(equipamento),
      anoReferencia: lote.dataEntrada.getFullYear(),
    }));
  }

  /** Grava a execução e, se houver, os modelos de vida útil numa só transação. */
  public async salvarExecucao(
    execucao: NovaExecucao,
    modelos: (ModeloVidaUtil & { variacaoAnos: number | null })[] = [],
    tx: ClienteBD = this.prisma,
  ): Promise<ExecucaoAnalise> {
    return tx.execucaoAnalise.create({
      data: {
        tipo: execucao.tipo,
        origem: execucao.origem,
        solicitante: execucao.solicitante,
        parametros: paraJson(execucao.parametros) ?? {},
        resultado: paraJson(execucao.resultado) ?? {},
        amostras: execucao.amostras,
        iniciadaEm: execucao.iniciadaEm,
        concluidaEm: execucao.concluidaEm,
        duracaoMs: Math.max(0, execucao.concluidaEm.getTime() - execucao.iniciadaEm.getTime()),
        previsoes: {
          create: modelos.map((m) => ({
            tipoEquipamento: m.tipo,
            metodo: m.metodo,
            amostras: m.amostras,
            coeficienteAngular: m.coeficienteAngular,
            intercepto: m.intercepto,
            r2: m.r2,
            idadeInservivelAnos: m.idadeInservivelAnos,
            variacaoAnos: m.variacaoAnos,
          })),
        },
      },
    });
  }

  public ultimaExecucao(tipo: TipoAnalise, tx: ClienteBD = this.prisma): Promise<ExecucaoAnalise | null> {
    return tx.execucaoAnalise.findFirst({ where: { tipo }, orderBy: { concluidaEm: 'desc' } });
  }

  public buscarExecucao(id: string, tx: ClienteBD = this.prisma): Promise<ExecucaoAnalise | null> {
    return tx.execucaoAnalise.findUnique({ where: { id } });
  }

  /** Histórico sem o JSON do resultado (que pode ser grande). */
  public listarExecucoes(filtro: { tipo?: TipoAnalise; limite: number }, tx: ClienteBD = this.prisma): Promise<ResumoExecucao[]> {
    return tx.execucaoAnalise.findMany({
      where: { tipo: filtro.tipo },
      omit: { resultado: true },
      orderBy: { concluidaEm: 'desc' },
      take: filtro.limite,
    });
  }

  /** Última previsão de cada tipo (base para calcular a variação da próxima). */
  public async ultimasPrevisoesPorTipo(tx: ClienteBD = this.prisma): Promise<Map<TipoEquipamento, PrevisaoVidaUtil>> {
    const linhas = await tx.previsaoVidaUtil.findMany({
      distinct: ['tipoEquipamento'],
      orderBy: [{ tipoEquipamento: 'asc' }, { criadaEm: 'desc' }],
    });
    return new Map(linhas.map((l) => [l.tipoEquipamento as TipoEquipamento, l]));
  }

  /** Dados do relatório assíncrono de rastreabilidade. */
  public listarRastreabilidade(organizacaoId?: string, tx: ClienteBD = this.prisma): Promise<LinhaRastreabilidade[]> {
    return listarRastreabilidade(tx, organizacaoId);
  }

  /** Série histórica das previsões: permite comparar o previsto com o que se realizou depois. */
  public historicoPrevisoes(filtro: { tipo?: TipoEquipamento; limite: number }, tx: ClienteBD = this.prisma): Promise<PrevisaoVidaUtil[]> {
    return tx.previsaoVidaUtil.findMany({
      where: { tipoEquipamento: filtro.tipo },
      orderBy: { criadaEm: 'desc' },
      take: filtro.limite,
    });
  }
}

/** Linha do relatório de rastreabilidade: equipamento + lote + última movimentação. */
export interface LinhaRastreabilidade {
  codigoBarrasInterno: string;
  tipo: string;
  marca: string;
  modelo: string;
  estadoFisico: string;
  statusRastreamento: string;
  notaFiscal: string;
  dataEntrada: Date;
  localAtual: string;
  ultimaMovimentacaoEm: Date | null;
  totalMovimentacoes: number;
}

/** Uma única consulta (sem N+1) para o relatório de rastreabilidade. */
export async function listarRastreabilidade(cliente: ClienteBD, organizacaoId?: string): Promise<LinhaRastreabilidade[]> {
  const linhas = await cliente.equipamento.findMany({
    where: { lote: { organizacaoId } },
    include: {
      lote: { select: { notaFiscal: true, dataEntrada: true } },
      movimentacoes: { orderBy: [{ dataHora: 'desc' }, { id: 'desc' }], take: 1, select: { destino: true, dataHora: true } },
      _count: { select: { movimentacoes: true } },
    },
    orderBy: [{ lote: { dataEntrada: 'desc' } }, { posicaoNoLote: 'asc' }],
  });
  return linhas.map((e) => ({
    codigoBarrasInterno: e.codigoBarrasInterno,
    tipo: e.tipo,
    marca: e.marca,
    modelo: e.modelo,
    estadoFisico: e.estadoFisico,
    statusRastreamento: e.statusRastreamento,
    notaFiscal: e.lote.notaFiscal,
    dataEntrada: e.lote.dataEntrada,
    localAtual: e.movimentacoes[0]?.destino ?? 'Almoxarifado',
    ultimaMovimentacaoEm: e.movimentacoes[0]?.dataHora ?? null,
    totalMovimentacoes: e._count.movimentacoes,
  }));
}
