import { randomUUID } from 'crypto';
import { EstadoFisico, ordemEstadoFisico } from '../enums/EstadoFisico';
import { StatusRastreamento } from '../enums/StatusRastreamento';
import { TipoEquipamento } from '../enums/TipoEquipamento';
import { Movimentacao } from './Movimentacao';

/**
 * Unidade principal de rastreabilidade (FR05).
 * Composição: Equipamento --> Movimentacao (o histórico nasce e morre com o equipamento).
 */
export class Equipamento {
  /** Depreciação linear padrão: 20% ao ano (vida útil de 5 anos). */
  public static readonly COEFICIENTE_PADRAO = 0.2;
  private static readonly RESPONSAVEL_SISTEMA = 'sistema';

  private id: string;
  private codigoBarrasInterno: string;
  private tipo: TipoEquipamento;
  private marca: string;
  private modelo: string;
  private anoFabricacao: number;
  private estadoFisico: EstadoFisico;
  private pesoQuilogramas: number;
  private loteId: string;
  private posicaoNoLote: number;
  private statusRastreamento: StatusRastreamento;
  private historicoMovimentacao: Movimentacao[];

  constructor(
    id: string,
    codigoBarrasInterno: string,
    tipo: TipoEquipamento,
    marca: string,
    modelo: string,
    anoFabricacao: number,
    estadoFisico: EstadoFisico,
    pesoQuilogramas: number,
    loteId: string,
    posicaoNoLote: number,
  ) {
    if (!Number.isFinite(pesoQuilogramas) || pesoQuilogramas <= 0) {
      throw new Error('O peso do equipamento deve ser maior que zero.');
    }
    if (!Number.isInteger(anoFabricacao) || anoFabricacao > new Date().getFullYear()) {
      throw new Error('Ano de fabricação inválido.');
    }
    this.id = id;
    this.codigoBarrasInterno = codigoBarrasInterno;
    this.tipo = tipo;
    this.marca = marca;
    this.modelo = modelo;
    this.anoFabricacao = anoFabricacao;
    this.estadoFisico = estadoFisico;
    this.pesoQuilogramas = pesoQuilogramas;
    this.loteId = loteId;
    this.posicaoNoLote = posicaoNoLote;
    this.statusRastreamento = StatusRastreamento.AGUARDANDO_TRIAGEM;
    this.historicoMovimentacao = [];
  }

  public atualizarStatus(
    novoStatus: StatusRastreamento,
    justificativa: string,
    responsavel: string = Equipamento.RESPONSAVEL_SISTEMA,
  ): void {
    if (novoStatus === this.statusRastreamento) {
      throw new Error(`O equipamento já está com status ${novoStatus}.`);
    }
    const anterior = this.statusRastreamento;
    this.statusRastreamento = novoStatus;
    const local = this.localAtual();
    this.adicionarMovimentacao(
      local,
      local,
      responsavel,
      `Status: ${anterior} → ${novoStatus}. ${justificativa ?? ''}`.trim(),
    );
  }

  public registrarMovimentacao(destino: string, responsavel: string): void {
    if (!destino?.trim()) throw new Error('Destino da movimentação é obrigatório.');
    if (!responsavel?.trim()) throw new Error('Responsável pela movimentação é obrigatório.');
    this.adicionarMovimentacao(this.localAtual(), destino, responsavel, '');
  }

  /**
   * Fração já depreciada do equipamento, de 0 (novo) a 1 (totalmente depreciado),
   * pela idade desde o ano de fabricação. O coeficiente anual é um parâmetro
   * global definido pelo Administrador.
   */
  public calcularDepreciacao(coeficienteAnual: number = Equipamento.COEFICIENTE_PADRAO): number {
    const idade = Math.max(0, new Date().getFullYear() - this.anoFabricacao);
    return Math.min(1, idade * coeficienteAnual);
  }

  /**
   * [Fora do UML] Altera o estado físico aplicando a regra do FR06:
   * uma queda de duas ou mais categorias exige justificativa textual.
   */
  public alterarEstadoFisico(
    novoEstado: EstadoFisico,
    justificativa?: string,
    responsavel: string = Equipamento.RESPONSAVEL_SISTEMA,
  ): void {
    if (novoEstado === this.estadoFisico) {
      throw new Error(`O equipamento já está no estado ${novoEstado}.`);
    }
    const queda = ordemEstadoFisico(novoEstado) - ordemEstadoFisico(this.estadoFisico);
    if (queda >= 2 && !justificativa?.trim()) {
      throw new Error(
        `Queda de ${queda} categorias (${this.estadoFisico} → ${novoEstado}) exige justificativa.`,
      );
    }
    const anterior = this.estadoFisico;
    this.estadoFisico = novoEstado;
    const local = this.localAtual();
    this.adicionarMovimentacao(
      local,
      local,
      responsavel,
      `Estado físico: ${anterior} → ${novoEstado}. ${justificativa ?? ''}`.trim(),
    );
  }

  /** Recria um Equipamento (com seu histórico) a partir dos dados lidos do arquivo. */
  public static reconstruir(dados: any): Equipamento {
    const equipamento = new Equipamento(
      dados.id,
      dados.codigoBarrasInterno,
      dados.tipo,
      dados.marca,
      dados.modelo,
      dados.anoFabricacao,
      dados.estadoFisico,
      dados.pesoQuilogramas,
      dados.loteId,
      dados.posicaoNoLote,
    );
    equipamento.statusRastreamento = dados.statusRastreamento;
    equipamento.historicoMovimentacao = (dados.historicoMovimentacao ?? []).map((m: any) =>
      Movimentacao.reconstruir(m),
    );
    return equipamento;
  }

  /** Local atual = destino da última movimentação; sem histórico, o próprio lote. */
  private localAtual(): string {
    const ultima = this.historicoMovimentacao[this.historicoMovimentacao.length - 1];
    return ultima ? ultima.getDestino() : `Lote ${this.loteId}`;
  }

  private adicionarMovimentacao(origem: string, destino: string, responsavel: string, observacao: string): void {
    this.historicoMovimentacao.push(
      new Movimentacao(randomUUID(), this.id, new Date(), origem, destino, responsavel, observacao),
    );
  }

  public getId(): string {
    return this.id;
  }

  public getCodigoBarrasInterno(): string {
    return this.codigoBarrasInterno;
  }

  public getTipo(): TipoEquipamento {
    return this.tipo;
  }

  public getMarca(): string {
    return this.marca;
  }

  public getModelo(): string {
    return this.modelo;
  }

  public getAnoFabricacao(): number {
    return this.anoFabricacao;
  }

  public getEstadoFisico(): EstadoFisico {
    return this.estadoFisico;
  }

  public getPesoQuilogramas(): number {
    return this.pesoQuilogramas;
  }

  public getLoteId(): string {
    return this.loteId;
  }

  public getPosicaoNoLote(): number {
    return this.posicaoNoLote;
  }

  public getStatusRastreamento(): StatusRastreamento {
    return this.statusRastreamento;
  }

  /** Devolve uma cópia: o histórico só cresce pelos métodos do próprio equipamento. */
  public getHistoricoMovimentacao(): Movimentacao[] {
    return [...this.historicoMovimentacao];
  }
}
