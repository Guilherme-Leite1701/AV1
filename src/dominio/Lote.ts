import { StatusLote } from '../enums/StatusLote';
import { StatusRastreamento } from '../enums/StatusRastreamento';
import { Equipamento } from './Equipamento';

/**
 * Agrupa os materiais recebidos de uma Organização (FR04).
 * Associação: Lote --> Organizacao (por organizacaoId).
 * Agregação:  Lote --> Equipamento (1..N).
 */
export class Lote {
  private id: string;
  private dataEntrada: Date;
  private organizacaoId: string;
  private notaFiscal: string;
  private transportadora: string;
  private equipamentos: Equipamento[];
  private statusProcessamento: StatusLote;
  private observacoes: string;

  constructor(
    id: string,
    dataEntrada: Date,
    organizacaoId: string,
    notaFiscal: string,
    transportadora: string,
    observacoes: string = '',
  ) {
    this.id = id;
    this.dataEntrada = dataEntrada;
    this.organizacaoId = organizacaoId;
    this.notaFiscal = notaFiscal;
    this.transportadora = transportadora;
    this.equipamentos = [];
    this.statusProcessamento = StatusLote.RECEBIDO;
    this.observacoes = observacoes;
  }

  public adicionarEquipamento(equip: Equipamento): void {
    if (equip.getLoteId() !== this.id) {
      throw new Error('O equipamento foi criado para outro lote.');
    }
    if (this.equipamentos.some((e) => e.getId() === equip.getId())) {
      throw new Error('Este equipamento já está no lote.');
    }
    this.equipamentos.push(equip);
  }

  public removerEquipamento(equipId: string): boolean {
    const indice = this.equipamentos.findIndex((e) => e.getId() === equipId);
    if (indice < 0) return false;
    this.equipamentos.splice(indice, 1);
    return true;
  }

  public calcularPesoTotal(): number {
    return this.equipamentos.reduce((total, e) => total + e.getPesoQuilogramas(), 0);
  }

  public gerarRelatorioTriagem(): string {
    const linhas: string[] = [
      `Relatório de triagem — Lote ${this.id}`,
      `Entrada: ${this.dataEntrada.toLocaleDateString('pt-BR')} | NF: ${this.notaFiscal} | Transportadora: ${this.transportadora}`,
      `Status do lote: ${this.statusProcessamento}`,
      `Equipamentos: ${this.equipamentos.length} | Peso total: ${this.calcularPesoTotal().toFixed(2)} kg`,
      '',
      'Por status de rastreamento:',
    ];
    for (const status of Object.values(StatusRastreamento)) {
      const quantidade = this.equipamentos.filter((e) => e.getStatusRastreamento() === status).length;
      if (quantidade > 0) linhas.push(`  ${status}: ${quantidade}`);
    }
    return linhas.join('\n');
  }

  /** [Fora do UML] Altera o status de processamento do lote. */
  public alterarStatus(novoStatus: StatusLote): void {
    this.statusProcessamento = novoStatus;
  }

  /** Recria um Lote (com seus equipamentos) a partir dos dados lidos do arquivo. */
  public static reconstruir(dados: any): Lote {
    const lote = new Lote(
      dados.id,
      new Date(dados.dataEntrada),
      dados.organizacaoId,
      dados.notaFiscal,
      dados.transportadora,
      dados.observacoes,
    );
    lote.statusProcessamento = dados.statusProcessamento;
    lote.equipamentos = (dados.equipamentos ?? []).map((e: any) => Equipamento.reconstruir(e));
    return lote;
  }

  public getId(): string {
    return this.id;
  }

  public getDataEntrada(): Date {
    return this.dataEntrada;
  }

  public getOrganizacaoId(): string {
    return this.organizacaoId;
  }

  public getNotaFiscal(): string {
    return this.notaFiscal;
  }

  public getTransportadora(): string {
    return this.transportadora;
  }

  public getEquipamentos(): Equipamento[] {
    return [...this.equipamentos];
  }

  public getStatusProcessamento(): StatusLote {
    return this.statusProcessamento;
  }

  public getObservacoes(): string {
    return this.observacoes;
  }
}
