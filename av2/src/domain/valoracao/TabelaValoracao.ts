import { EstadoFisico } from '../enums/EstadoFisico';
import { TipoEquipamento } from '../enums/TipoEquipamento';

/** V_atual = V_base × (1 − min(0,90; idade × c_dep)) × F_estado */
export class TabelaValoracao {
  /** Valor Base de Novo (V_base), em R$, por tipo de equipamento. */
  public static readonly VALOR_BASE_NOVO: Readonly<Record<TipoEquipamento, number>> = {
    [TipoEquipamento.SERVIDOR]: 15000,
    [TipoEquipamento.NOTEBOOK]: 4500,
    [TipoEquipamento.COMPUTADOR_MESA]: 3200,
    [TipoEquipamento.IMPRESSORA]: 2000,
    [TipoEquipamento.MONITOR]: 1200,
    [TipoEquipamento.ROTEADOR]: 800,
    [TipoEquipamento.FONTE_ALIMENTACAO]: 400,
    [TipoEquipamento.CABO_ESTRUTURADO]: 150,
  };

  /** Fator de Conservação Física (F_estado). */
  public static readonly FATOR_CONSERVACAO: Readonly<Record<EstadoFisico, number>> = {
    [EstadoFisico.NOVO]: 1.0,
    [EstadoFisico.BOM_ESTADO]: 0.85,
    [EstadoFisico.USADO_LEVE]: 0.7,
    [EstadoFisico.USADO_MODERADO]: 0.5,
    [EstadoFisico.DANIFICADO_LEVE]: 0.3,
    [EstadoFisico.DANIFICADO_GRAVE]: 0.15,
    [EstadoFisico.INSERVIVEL]: 0.05,
  };

  public static readonly COEFICIENTE_DEPRECIACAO_PADRAO = 0.15;
  public static readonly TETO_DEPRECIACAO_IDADE = 0.9;

  /** Kg de metal nobre recuperável por kg de equipamento. */
  public static readonly TEOR_METAL_NOBRE: Readonly<Record<TipoEquipamento, number>> = {
    [TipoEquipamento.SERVIDOR]: 0.003,
    [TipoEquipamento.NOTEBOOK]: 0.0025,
    [TipoEquipamento.ROTEADOR]: 0.002,
    [TipoEquipamento.COMPUTADOR_MESA]: 0.0015,
    [TipoEquipamento.FONTE_ALIMENTACAO]: 0.001,
    [TipoEquipamento.IMPRESSORA]: 0.0005,
    [TipoEquipamento.MONITOR]: 0.0004,
    [TipoEquipamento.CABO_ESTRUTURADO]: 0,
  };

  /** R$ por kg de metal nobre recuperado. */
  public static readonly BONUS_POR_KG_METAL_NOBRE = 2500;
}
