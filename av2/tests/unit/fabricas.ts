import { Equipamento, PropsEquipamento } from '../../src/domain/entidades/Equipamento';
import { EstadoFisico } from '../../src/domain/enums/EstadoFisico';
import { StatusRastreamento } from '../../src/domain/enums/StatusRastreamento';
import { TipoEquipamento } from '../../src/domain/enums/TipoEquipamento';

export function criarEquipamento(sobrescrever: Partial<PropsEquipamento> = {}): Equipamento {
  return new Equipamento({
    id: 'eq-1',
    codigoBarrasInterno: 'GC-NBK-2026-000001',
    tipo: TipoEquipamento.NOTEBOOK,
    marca: 'Dell',
    modelo: 'Latitude 5420',
    anoFabricacao: 2022,
    estadoFisico: EstadoFisico.BOM_ESTADO,
    pesoQuilogramas: 1.8,
    loteId: 'lote-1',
    posicaoNoLote: 1,
    statusRastreamento: StatusRastreamento.EM_TRIAGEM,
    versao: 1,
    ...sobrescrever,
  });
}
