import { EstadoFisico, indiceEstadoFisico } from '../enums/EstadoFisico';
import { TipoEquipamento } from '../enums/TipoEquipamento';
import { arredondar2 } from '../utils/datas';
import { AmostraRentabilidade } from './AnalisadorRentabilidade';
import { ModeloLinear, RegressaoLinear } from './Estatistica';

export type ConfiancaModelo = 'ALTA' | 'MEDIA' | 'BAIXA' | 'DADOS_INSUFICIENTES' | 'SEM_TENDENCIA';

/** Modelo de degradação de um tipo: índice do estado físico (0..6) em função da idade (anos). */
export interface ModeloVidaUtil {
  tipo: TipoEquipamento;
  metodo: 'MINIMOS_QUADRADOS_ORDINARIOS';
  amostras: number;
  coeficienteAngular: number;
  intercepto: number;
  r2: number;
  /** Idade em que a reta atinge INSERVIVEL; null quando não há tendência de degradação. */
  idadeInservivelAnos: number | null;
  /** Quanto o estado piora, em níveis, a cada ano. */
  degradacaoNiveisPorAno: number;
  confianca: ConfiancaModelo;
}

/** Projeção para um equipamento específico. */
export interface ProjecaoEquipamento {
  idadeAnos: number;
  indiceEstadoAtual: number;
  anosRestantes: number | null;
  anoPrevistoInservivel: number | null;
  confianca: ConfiancaModelo;
}

export interface ResultadoVidaUtil {
  totalAmostras: number;
  modelos: ModeloVidaUtil[];
}

/**
 * Análise preditiva de vida útil remanescente.
 * Cada equipamento vira um ponto (idade no ano de entrada, índice do estado físico);
 * a regressão por tipo estima a velocidade de degradação e a idade em que o tipo fica INSERVIVEL.
 */
export class AnalisadorVidaUtil {
  public static readonly INDICE_INSERVIVEL = indiceEstadoFisico(EstadoFisico.INSERVIVEL);
  public static readonly MINIMO_AMOSTRAS = 3;

  /** Ajusta um modelo por tipo de equipamento. */
  public static analisar(amostras: readonly AmostraRentabilidade[]): ResultadoVidaUtil {
    const pontosPorTipo = new Map<TipoEquipamento, [number, number][]>();
    for (const { equipamento, anoReferencia } of amostras) {
      const idade = Math.max(0, anoReferencia - equipamento.paraJSON().anoFabricacao);
      const pontos = pontosPorTipo.get(equipamento.tipo) ?? [];
      pontos.push([idade, indiceEstadoFisico(equipamento.estadoFisico)]);
      pontosPorTipo.set(equipamento.tipo, pontos);
    }

    const modelos = Object.values(TipoEquipamento)
      .filter((tipo) => pontosPorTipo.has(tipo))
      .map((tipo) => AnalisadorVidaUtil.ajustarTipo(tipo, pontosPorTipo.get(tipo) ?? []));

    return { totalAmostras: amostras.length, modelos };
  }

  /** Ajusta a reta de degradação de um tipo e classifica a confiança do modelo. */
  public static ajustarTipo(tipo: TipoEquipamento, pontos: [number, number][]): ModeloVidaUtil {
    const modelo = pontos.length >= AnalisadorVidaUtil.MINIMO_AMOSTRAS ? RegressaoLinear.ajustar(pontos) : null;
    if (!modelo) {
      return {
        tipo,
        metodo: 'MINIMOS_QUADRADOS_ORDINARIOS',
        amostras: pontos.length,
        coeficienteAngular: 0,
        intercepto: 0,
        r2: 0,
        idadeInservivelAnos: null,
        degradacaoNiveisPorAno: 0,
        confianca: 'DADOS_INSUFICIENTES',
      };
    }
    const comTendencia = modelo.coeficienteAngular > 0;
    const idade = comTendencia ? RegressaoLinear.resolverX(modelo, AnalisadorVidaUtil.INDICE_INSERVIVEL) : null;
    return {
      tipo,
      metodo: 'MINIMOS_QUADRADOS_ORDINARIOS',
      amostras: modelo.amostras,
      coeficienteAngular: arredondar4(modelo.coeficienteAngular),
      intercepto: arredondar4(modelo.intercepto),
      r2: arredondar4(modelo.r2),
      idadeInservivelAnos: idade === null ? null : arredondar2(Math.max(0, idade)),
      degradacaoNiveisPorAno: arredondar4(Math.max(0, modelo.coeficienteAngular)),
      confianca: comTendencia ? AnalisadorVidaUtil.classificar(modelo) : 'SEM_TENDENCIA',
    };
  }

  /**
   * Projeta um equipamento a partir do estado ATUAL (e não da média do tipo):
   *   anosRestantes = (6 − índice atual) / degradação anual
   */
  public static projetar(
    modelo: ModeloVidaUtil | undefined,
    dados: { anoFabricacao: number; estadoFisico: EstadoFisico },
    anoAtual: number,
  ): ProjecaoEquipamento {
    const idadeAnos = Math.max(0, anoAtual - dados.anoFabricacao);
    const indiceEstadoAtual = indiceEstadoFisico(dados.estadoFisico);
    if (indiceEstadoAtual >= AnalisadorVidaUtil.INDICE_INSERVIVEL) {
      return {
        idadeAnos,
        indiceEstadoAtual,
        anosRestantes: 0,
        anoPrevistoInservivel: anoAtual,
        confianca: modelo?.confianca ?? 'DADOS_INSUFICIENTES',
      };
    }
    if (!modelo || modelo.degradacaoNiveisPorAno <= 0) {
      return {
        idadeAnos,
        indiceEstadoAtual,
        anosRestantes: null,
        anoPrevistoInservivel: null,
        confianca: modelo?.confianca ?? 'DADOS_INSUFICIENTES',
      };
    }
    const anosRestantes = arredondar2((AnalisadorVidaUtil.INDICE_INSERVIVEL - indiceEstadoAtual) / modelo.degradacaoNiveisPorAno);
    return {
      idadeAnos,
      indiceEstadoAtual,
      anosRestantes,
      anoPrevistoInservivel: Math.round(anoAtual + anosRestantes),
      confianca: modelo.confianca,
    };
  }

  private static classificar(modelo: ModeloLinear): ConfiancaModelo {
    if (modelo.amostras >= 10 && modelo.r2 >= 0.6) return 'ALTA';
    if (modelo.amostras >= 5 && modelo.r2 >= 0.3) return 'MEDIA';
    return 'BAIXA';
  }
}

function arredondar4(valor: number): number {
  return Math.round(valor * 10_000) / 10_000;
}
