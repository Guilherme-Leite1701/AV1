export interface PropsMovimentacao {
  id: string;
  equipamentoId: string;
  dataHora: Date;
  origem: string;
  destino: string;
  responsavel: string;
  observacao: string;
}

export type NovaMovimentacao = Omit<PropsMovimentacao, 'id' | 'dataHora'>;

export class Movimentacao {
  constructor(private readonly props: PropsMovimentacao) {}

  /** Destino da última movimentação. */
  public static localAtual(historico: PropsMovimentacao[], loteId: string): string {
    const ultima = historico[historico.length - 1];
    return ultima ? ultima.destino : `Lote ${loteId}`;
  }

  public get destino(): string {
    return this.props.destino;
  }

  public paraJSON(): PropsMovimentacao {
    return { ...this.props };
  }
}
