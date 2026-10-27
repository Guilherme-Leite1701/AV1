import { TipoEquipamento } from '../enums/TipoEquipamento';
import { ErroValidacao } from '../erros/ErrosAplicacao';

/** GC-{PREFIXO}-{ANO}-{SEQUÊNCIA}, ex.: GC-NBK-2026-000001. */
export class GeradorCodigoBarras {
  public static readonly PREFIXOS: Readonly<Record<TipoEquipamento, string>> = {
    [TipoEquipamento.COMPUTADOR_MESA]: 'CPU',
    [TipoEquipamento.NOTEBOOK]: 'NBK',
    [TipoEquipamento.MONITOR]: 'MON',
    [TipoEquipamento.IMPRESSORA]: 'IMP',
    [TipoEquipamento.SERVIDOR]: 'SRV',
    [TipoEquipamento.ROTEADOR]: 'RTD',
    [TipoEquipamento.CABO_ESTRUTURADO]: 'CAB',
    [TipoEquipamento.FONTE_ALIMENTACAO]: 'FNT',
  };

  public static readonly SEQUENCIA_MAXIMA = 999_999;

  public static gerarCodigoBarras(tipo: TipoEquipamento, ano: number, sequencia: number): string {
    const prefixo = GeradorCodigoBarras.PREFIXOS[tipo];
    if (!prefixo) throw new ErroValidacao(`Tipo de equipamento desconhecido: ${tipo}.`);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 9999) throw new ErroValidacao('Ano inválido para o código de barras.');
    if (!Number.isInteger(sequencia) || sequencia < 1 || sequencia > GeradorCodigoBarras.SEQUENCIA_MAXIMA) {
      throw new ErroValidacao(`A sequência deve ser um inteiro entre 1 e ${GeradorCodigoBarras.SEQUENCIA_MAXIMA}.`);
    }
    return `GC-${prefixo}-${ano}-${String(sequencia).padStart(6, '0')}`;
  }

  /** Uma sequência por ano. */
  public static chaveContador(ano: number): string {
    return `CODIGO_BARRAS_${ano}`;
  }
}
