import { Equipamento } from '../entidades/Equipamento';
import { EstadoFisico } from '../enums/EstadoFisico';
import { TipoEquipamento } from '../enums/TipoEquipamento';
import { arredondar2 } from '../utils/datas';
import { ResumoEstatistico, agruparPor, resumir } from './Estatistica';

export type DestinoRecomendado = 'REUSO_DE_PECAS' | 'RECICLAGEM_DE_MATERIAL' | 'DESCARTE_SEGURO';

export interface ParametrosRentabilidade {
  coeficienteDepreciacaoAnual: number;
  custoDescartePorKg: number;
}

/** Equipamento e o ano em que foi avaliado (ano de entrada do lote). */
export interface AmostraRentabilidade {
  equipamento: Equipamento;
  anoReferencia: number;
}

/** Estimativa de retorno de um único equipamento. */
export interface EstimativaRetorno {
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  valorReuso: number;
  valorMaterial: number;
  custoDescarte: number;
  retornoLiquido: number;
  retornoPorKg: number;
  destinoRecomendado: DestinoRecomendado;
}

interface Agregado {
  quantidade: number;
  retornoTotal: number;
  retornoMedio: number;
  retornoMediano: number;
  retornoMedioPorKg: number;
}

export interface ResultadoRentabilidade {
  parametros: ParametrosRentabilidade;
  totalEquipamentos: number;
  retornoTotalEstimado: number;
  retornoLiquido: ResumoEstatistico | null;
  /** Ordenado do maior para o menor retorno médio: é a lista de prioridade. */
  porTipo: ({ tipo: TipoEquipamento; prioridade: number; participacaoPercentual: number } & Agregado)[];
  porTipoEEstado: ({ tipo: TipoEquipamento; estadoFisico: EstadoFisico } & Agregado)[];
  porMarca: ({ marca: string } & Agregado)[];
  /** Os modelos de maior retorno médio (com pelo menos 2 unidades). */
  modelosMaisRentaveis: ({ marca: string; modelo: string } & Agregado)[];
  destinos: Record<DestinoRecomendado, number>;
}

/**
 * Rentabilidade por tipo de equipamento.
 *   valorReuso    = valor residual (depreciação da AV2)
 *   valorMaterial = bônus de metal nobre (peso × teor × R$/kg)
 *   custoDescarte = peso × custo/kg, cobrado só de itens DANIFICADO_GRAVE ou INSERVIVEL
 *   retornoLiquido = max(valorReuso, valorMaterial) − custoDescarte
 */
export class AnalisadorRentabilidade {
  public static readonly ESTADOS_COM_REJEITO: readonly EstadoFisico[] = [EstadoFisico.DANIFICADO_GRAVE, EstadoFisico.INSERVIVEL];
  public static readonly MINIMO_UNIDADES_MODELO = 2;
  public static readonly LIMITE_MODELOS = 10;

  /** Estima o retorno de um equipamento e o destino que maximiza o valor recuperado. */
  public static estimar(amostra: AmostraRentabilidade, parametros: ParametrosRentabilidade): EstimativaRetorno {
    const e = amostra.equipamento;
    const dados = e.paraJSON();
    const valorReuso = e.calcularDepreciacao(parametros.coeficienteDepreciacaoAnual, amostra.anoReferencia).valorAtual;
    const valorMaterial = e.calcularBonusMetalNobre();
    const custoDescarte = AnalisadorRentabilidade.ESTADOS_COM_REJEITO.includes(e.estadoFisico)
      ? arredondar2(e.pesoQuilogramas * parametros.custoDescartePorKg)
      : 0;
    const retornoLiquido = arredondar2(Math.max(valorReuso, valorMaterial) - custoDescarte);

    let destinoRecomendado: DestinoRecomendado;
    if (retornoLiquido <= 0) destinoRecomendado = 'DESCARTE_SEGURO';
    else destinoRecomendado = valorReuso >= valorMaterial ? 'REUSO_DE_PECAS' : 'RECICLAGEM_DE_MATERIAL';

    return {
      codigoBarrasInterno: e.codigoBarrasInterno,
      tipo: e.tipo,
      marca: dados.marca,
      modelo: dados.modelo,
      estadoFisico: e.estadoFisico,
      pesoQuilogramas: e.pesoQuilogramas,
      valorReuso,
      valorMaterial,
      custoDescarte,
      retornoLiquido,
      retornoPorKg: arredondar2(retornoLiquido / e.pesoQuilogramas),
      destinoRecomendado,
    };
  }

  /** Agrega as estimativas por tipo, tipo × estado, marca e modelo. */
  public static analisar(amostras: readonly AmostraRentabilidade[], parametros: ParametrosRentabilidade): ResultadoRentabilidade {
    const estimativas = amostras.map((a) => AnalisadorRentabilidade.estimar(a, parametros));
    const retornoTotal = arredondar2(estimativas.reduce((t, e) => t + e.retornoLiquido, 0));

    const porTipo = [...agruparPor(estimativas, (e) => e.tipo)]
      .map(([tipo, grupo]) => ({ tipo: tipo as TipoEquipamento, ...agregar(grupo) }))
      .sort((a, b) => b.retornoMedio - a.retornoMedio)
      .map((linha, i) => ({
        ...linha,
        prioridade: i + 1,
        participacaoPercentual: retornoTotal > 0 ? arredondar2((linha.retornoTotal / retornoTotal) * 100) : 0,
      }));

    const porTipoEEstado = [...agruparPor(estimativas, (e) => `${e.tipo}|${e.estadoFisico}`)]
      .map(([chave, grupo]) => {
        const [tipo, estadoFisico] = chave.split('|') as [TipoEquipamento, EstadoFisico];
        return { tipo, estadoFisico, ...agregar(grupo) };
      })
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || b.retornoMedio - a.retornoMedio);

    const porMarca = [...agruparPor(estimativas, (e) => e.marca)]
      .map(([marca, grupo]) => ({ marca, ...agregar(grupo) }))
      .sort((a, b) => b.retornoMedio - a.retornoMedio);

    const modelosMaisRentaveis = [...agruparPor(estimativas, (e) => `${e.marca}|${e.modelo}`)]
      .filter(([, grupo]) => grupo.length >= AnalisadorRentabilidade.MINIMO_UNIDADES_MODELO)
      .map(([chave, grupo]) => {
        const [marca, modelo] = chave.split('|');
        return { marca, modelo, ...agregar(grupo) };
      })
      .sort((a, b) => b.retornoMedio - a.retornoMedio)
      .slice(0, AnalisadorRentabilidade.LIMITE_MODELOS);

    const destinos: Record<DestinoRecomendado, number> = { REUSO_DE_PECAS: 0, RECICLAGEM_DE_MATERIAL: 0, DESCARTE_SEGURO: 0 };
    for (const e of estimativas) destinos[e.destinoRecomendado]++;

    return {
      parametros,
      totalEquipamentos: estimativas.length,
      retornoTotalEstimado: retornoTotal,
      retornoLiquido: resumir(estimativas.map((e) => e.retornoLiquido)),
      porTipo,
      porTipoEEstado,
      porMarca,
      modelosMaisRentaveis,
      destinos,
    };
  }
}

function agregar(grupo: EstimativaRetorno[]): Agregado {
  const resumo = resumir(grupo.map((e) => e.retornoLiquido)) as ResumoEstatistico;
  const peso = grupo.reduce((t, e) => t + e.pesoQuilogramas, 0);
  const total = grupo.reduce((t, e) => t + e.retornoLiquido, 0);
  return {
    quantidade: grupo.length,
    retornoTotal: arredondar2(total),
    retornoMedio: resumo.media,
    retornoMediano: resumo.mediana,
    retornoMedioPorKg: peso > 0 ? arredondar2(total / peso) : 0,
  };
}
