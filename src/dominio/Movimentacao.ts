/**
 * Registro de auditoria de uma mudança do equipamento (FR06).
 * Imutável: depois de criada, uma movimentação não é alterada.
 */
export class Movimentacao {
  private id: string;
  private equipamentoId: string;
  private dataHora: Date;
  private origem: string;
  private destino: string;
  private responsavel: string;
  private observacao: string;

  constructor(
    id: string,
    equipamentoId: string,
    dataHora: Date,
    origem: string,
    destino: string,
    responsavel: string,
    observacao: string,
  ) {
    this.id = id;
    this.equipamentoId = equipamentoId;
    this.dataHora = dataHora;
    this.origem = origem;
    this.destino = destino;
    this.responsavel = responsavel;
    this.observacao = observacao;
  }

  /** Recria uma Movimentacao a partir dos dados lidos do arquivo. */
  public static reconstruir(dados: any): Movimentacao {
    return new Movimentacao(
      dados.id,
      dados.equipamentoId,
      new Date(dados.dataHora),
      dados.origem,
      dados.destino,
      dados.responsavel,
      dados.observacao,
    );
  }

  public getId(): string {
    return this.id;
  }

  public getEquipamentoId(): string {
    return this.equipamentoId;
  }

  public getDataHora(): Date {
    return this.dataHora;
  }

  public getOrigem(): string {
    return this.origem;
  }

  public getDestino(): string {
    return this.destino;
  }

  public getResponsavel(): string {
    return this.responsavel;
  }

  public getObservacao(): string {
    return this.observacao;
  }
}
