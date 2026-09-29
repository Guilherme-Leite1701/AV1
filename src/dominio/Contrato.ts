/**
 * Contrato de coleta firmado com uma Organização geradora (FR03).
 */
export class Contrato {
  private id: string;
  private organizacaoId: string;
  private dataAssinatura: Date;
  private dataVencimento: Date;
  private clausulas: string[];
  private valorMensal: number;
  private renovacaoAutomatica: boolean;

  constructor(
    id: string,
    organizacaoId: string,
    dataAssinatura: Date,
    dataVencimento: Date,
    clausulas: string[],
    valorMensal: number,
    renovacaoAutomatica: boolean,
  ) {
    if (isNaN(dataAssinatura.getTime()) || isNaN(dataVencimento.getTime())) {
      throw new Error('Datas do contrato inválidas.');
    }
    if (dataVencimento.getTime() <= dataAssinatura.getTime()) {
      throw new Error('A data de vencimento deve ser posterior à data de assinatura.');
    }
    if (!Number.isFinite(valorMensal) || valorMensal < 0) {
      throw new Error('Valor mensal do contrato inválido.');
    }
    this.id = id;
    this.organizacaoId = organizacaoId;
    this.dataAssinatura = dataAssinatura;
    this.dataVencimento = dataVencimento;
    this.clausulas = [...clausulas];
    this.valorMensal = valorMensal;
    this.renovacaoAutomatica = renovacaoAutomatica;
  }

  public estaVigente(): boolean {
    const agora = Date.now();
    return this.dataAssinatura.getTime() <= agora && agora <= this.dataVencimento.getTime();
  }

  public renovar(novoVencimento: Date): void {
    if (isNaN(novoVencimento.getTime()) || novoVencimento.getTime() <= this.dataVencimento.getTime()) {
      throw new Error('O novo vencimento deve ser posterior ao vencimento atual.');
    }
    this.dataVencimento = novoVencimento;
  }

  /** Recria um Contrato a partir dos dados lidos do arquivo (datas voltam como texto). */
  public static reconstruir(dados: any): Contrato {
    return new Contrato(
      dados.id,
      dados.organizacaoId,
      new Date(dados.dataAssinatura),
      new Date(dados.dataVencimento),
      dados.clausulas ?? [],
      Number(dados.valorMensal),
      Boolean(dados.renovacaoAutomatica),
    );
  }

  public getId(): string {
    return this.id;
  }

  public getOrganizacaoId(): string {
    return this.organizacaoId;
  }

  public getDataAssinatura(): Date {
    return this.dataAssinatura;
  }

  public getDataVencimento(): Date {
    return this.dataVencimento;
  }

  public getClausulas(): string[] {
    return [...this.clausulas];
  }

  public getValorMensal(): number {
    return this.valorMensal;
  }

  public isRenovacaoAutomatica(): boolean {
    return this.renovacaoAutomatica;
  }
}
