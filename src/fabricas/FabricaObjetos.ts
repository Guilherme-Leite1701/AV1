import { Administrador } from '../autenticacao/Administrador';
import { Auditor } from '../autenticacao/Auditor';
import { Credencial } from '../autenticacao/Credencial';
import { GestorAlmoxarifado } from '../autenticacao/GestorAlmoxarifado';
import { OperadorCadastro } from '../autenticacao/OperadorCadastro';
import { Usuario } from '../autenticacao/Usuario';
import { Equipamento } from '../dominio/Equipamento';
import { EstadoFisico } from '../enums/EstadoFisico';
import { PapelUsuario } from '../enums/PapelUsuario';
import { TipoEquipamento } from '../enums/TipoEquipamento';

export interface DadosEquipamento {
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
}

/** Fábrica (Factory): concentra a criação de objetos que exigem escolha ou montagem. */
export class FabricaObjetos {
  /** Escolhe a subclasse de Usuario de acordo com o papel da credencial. */
  public static criarUsuario(credencial: Credencial): Usuario {
    switch (credencial.getPapel()) {
      case PapelUsuario.ADMINISTRADOR:
        return new Administrador(credencial);
      case PapelUsuario.OPERADOR_CADASTRO:
        return new OperadorCadastro(credencial);
      case PapelUsuario.GESTOR_ALMOXARIFADO:
        return new GestorAlmoxarifado(credencial);
      case PapelUsuario.AUDITOR:
        return new Auditor(credencial);
    }
  }

  /**
   * Cria o equipamento já com a sua movimentação de entrada,
   * garantindo que nenhum equipamento exista sem histórico.
   */
  public static criarEquipamento(
    id: string,
    codigoBarras: string,
    dados: DadosEquipamento,
    loteId: string,
    posicaoNoLote: number,
    responsavel: string,
  ): Equipamento {
    const equipamento = new Equipamento(
      id,
      codigoBarras,
      dados.tipo,
      dados.marca,
      dados.modelo,
      dados.anoFabricacao,
      dados.estadoFisico,
      dados.pesoQuilogramas,
      loteId,
      posicaoNoLote,
    );
    equipamento.registrarMovimentacao('Almoxarifado', responsavel);
    return equipamento;
  }
}
