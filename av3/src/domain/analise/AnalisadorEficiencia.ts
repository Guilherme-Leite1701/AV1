import { arredondar2 } from '../utils/datas';
import { ResumoEstatistico, agruparPor, escoresZ, resumir, suavizacaoExponencial } from './Estatistica';

const HORA = 60 * 60 * 1000;

/** Um lote que já concluiu a triagem, com os três marcos de tempo. */
export interface AmostraTriagem {
  loteId: string;
  notaFiscal: string;
  organizacao: string;
  responsavel: string | null;
  quantidadeEquipamentos: number;
  dataEntrada: Date;
  dataInicioTriagem: Date;
  dataConclusaoTriagem: Date;
}

export type EtapaProcesso = 'ESPERA_ATE_TRIAGEM' | 'TRIAGEM';

export interface ResultadoEficiencia {
  totalLotes: number;
  totalEquipamentos: number;
  /** Entrada → conclusão da triagem (lead time completo). */
  leadTimeHoras: ResumoEstatistico | null;
  /** Entrada → início da triagem (tempo em fila no almoxarifado). */
  esperaHoras: ResumoEstatistico | null;
  /** Início → conclusão da triagem (tempo de trabalho). */
  triagemHoras: ResumoEstatistico | null;
  gargalo: { etapa: EtapaProcesso; participacaoPercentual: number } | null;
  porResponsavel: {
    responsavel: string;
    lotes: number;
    equipamentos: number;
    leadTimeMedioHoras: number;
    triagemMediaHoras: number;
    equipamentosPorHoraDeTriagem: number;
  }[];
  /** Coeficiente de variação entre as médias dos responsáveis (%): quanto maior, mais desigual. */
  variacaoEntreResponsaveisPercentual: number | null;
  porMes: { mes: string; lotes: number; leadTimeMedioHoras: number; triagemMediaHoras: number }[];
  /** Próximo mês, por suavização exponencial da série mensal de lead time. */
  tendencia: { alfa: number; previsaoLeadTimeProximoMesHoras: number | null; serieSuavizada: number[] };
  /** Lotes com lead time acima de 2 desvios-padrão da média (escore-z > 2). */
  lotesAtipicos: { loteId: string; notaFiscal: string; organizacao: string; leadTimeHoras: number; escoreZ: number }[];
}

/** Análise de eficiência operacional: tempos de processamento, gargalos e variação entre operadores. */
export class AnalisadorEficiencia {
  public static readonly ALFA_SUAVIZACAO = 0.5;
  public static readonly LIMITE_ESCORE_Z = 2;

  /** Calcula as métricas a partir das amostras (função pura, sem acesso a banco). */
  public static analisar(amostras: readonly AmostraTriagem[]): ResultadoEficiencia {
    const medidas = amostras.map((a) => ({
      amostra: a,
      leadTime: horasEntre(a.dataEntrada, a.dataConclusaoTriagem),
      espera: horasEntre(a.dataEntrada, a.dataInicioTriagem),
      triagem: horasEntre(a.dataInicioTriagem, a.dataConclusaoTriagem),
    }));

    const leadTimeHoras = resumir(medidas.map((m) => m.leadTime));
    const esperaHoras = resumir(medidas.map((m) => m.espera));
    const triagemHoras = resumir(medidas.map((m) => m.triagem));

    const porResponsavel = [...agruparPor(medidas, (m) => m.amostra.responsavel ?? 'não informado')].map(([responsavel, grupo]) => {
      const horasTriagem = grupo.reduce((t, m) => t + m.triagem, 0);
      const equipamentos = grupo.reduce((t, m) => t + m.amostra.quantidadeEquipamentos, 0);
      return {
        responsavel,
        lotes: grupo.length,
        equipamentos,
        leadTimeMedioHoras: arredondar2(media(grupo.map((m) => m.leadTime))),
        triagemMediaHoras: arredondar2(horasTriagem / grupo.length),
        equipamentosPorHoraDeTriagem: horasTriagem > 0 ? arredondar2(equipamentos / horasTriagem) : 0,
      };
    });
    porResponsavel.sort((a, b) => a.leadTimeMedioHoras - b.leadTimeMedioHoras);

    const porMes = [...agruparPor(medidas, (m) => chaveMes(m.amostra.dataConclusaoTriagem))]
      .map(([mes, grupo]) => ({
        mes,
        lotes: grupo.length,
        leadTimeMedioHoras: arredondar2(media(grupo.map((m) => m.leadTime))),
        triagemMediaHoras: arredondar2(media(grupo.map((m) => m.triagem))),
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    const suavizacao = suavizacaoExponencial(
      porMes.map((m) => m.leadTimeMedioHoras),
      AnalisadorEficiencia.ALFA_SUAVIZACAO,
    );

    const z = escoresZ(medidas.map((m) => m.leadTime));
    const lotesAtipicos = medidas
      .map((m, i) => ({ m, z: z[i] }))
      .filter(({ z: escore }) => escore > AnalisadorEficiencia.LIMITE_ESCORE_Z)
      .map(({ m, z: escore }) => ({
        loteId: m.amostra.loteId,
        notaFiscal: m.amostra.notaFiscal,
        organizacao: m.amostra.organizacao,
        leadTimeHoras: arredondar2(m.leadTime),
        escoreZ: arredondar2(escore),
      }));

    const variacao = resumir(porResponsavel.map((r) => r.leadTimeMedioHoras));

    return {
      totalLotes: medidas.length,
      totalEquipamentos: amostras.reduce((t, a) => t + a.quantidadeEquipamentos, 0),
      leadTimeHoras,
      esperaHoras,
      triagemHoras,
      gargalo: AnalisadorEficiencia.identificarGargalo(esperaHoras, triagemHoras),
      porResponsavel,
      variacaoEntreResponsaveisPercentual: porResponsavel.length > 1 && variacao ? variacao.coeficienteVariacaoPercentual : null,
      porMes,
      tendencia: {
        alfa: AnalisadorEficiencia.ALFA_SUAVIZACAO,
        previsaoLeadTimeProximoMesHoras: suavizacao.previsao,
        serieSuavizada: suavizacao.suavizada,
      },
      lotesAtipicos,
    };
  }

  /** A etapa que consome a maior parte do lead time médio é o gargalo. */
  private static identificarGargalo(espera: ResumoEstatistico | null, triagem: ResumoEstatistico | null): ResultadoEficiencia['gargalo'] {
    if (!espera || !triagem) return null;
    const total = espera.media + triagem.media;
    if (total <= 0) return null;
    const etapa: EtapaProcesso = espera.media >= triagem.media ? 'ESPERA_ATE_TRIAGEM' : 'TRIAGEM';
    const maior = Math.max(espera.media, triagem.media);
    return { etapa, participacaoPercentual: arredondar2((maior / total) * 100) };
  }
}

function horasEntre(inicio: Date, fim: Date): number {
  return Math.max(0, (fim.getTime() - inicio.getTime()) / HORA);
}

function media(valores: number[]): number {
  return valores.length ? valores.reduce((t, v) => t + v, 0) / valores.length : 0;
}

/** "AAAA-MM" no fuso local. */
function chaveMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}
