import { StatusLote } from '../enums/StatusLote';
import { STATUS_RASTREAMENTO_FINAIS, StatusRastreamento } from '../enums/StatusRastreamento';
import { ErroRegraNegocio } from '../erros/ErrosAplicacao';
import { arredondar2 } from '../utils/datas';

export interface PropsLote {
  id: string;
  dataEntrada: Date;
  organizacaoId: string;
  notaFiscal: string;
  transportadora: string;
  statusProcessamento: StatusLote;
  observacoes: string;
  versao: number;
}

/** Fluxo: RECEBIDO → EM_TRIAGEM → TRIAGEM_CONCLUIDA → ENCAMINHADO → FINALIZADO. */
export class Lote {
  private static readonly STATUS_TRIADOS: readonly StatusLote[] = [
    StatusLote.TRIAGEM_CONCLUIDA,
    StatusLote.ENCAMINHADO,
    StatusLote.FINALIZADO,
  ];

  private props: PropsLote;

  constructor(props: PropsLote) {
    this.props = { ...props };
  }

  public garantirAbertoParaEquipamentos(): void {
    if (this.props.statusProcessamento !== StatusLote.RECEBIDO) {
      throw new ErroRegraNegocio(
        `Só é possível adicionar ou remover equipamentos de um lote RECEBIDO (atual: ${this.props.statusProcessamento}).`,
      );
    }
  }

  public avancarTriagem(quantidadeEquipamentos: number): { anterior: StatusLote; novo: StatusLote } {
    const anterior = this.props.statusProcessamento;
    let novo: StatusLote;
    if (anterior === StatusLote.RECEBIDO) {
      if (quantidadeEquipamentos === 0) throw new ErroRegraNegocio('O lote não possui equipamentos para triar.');
      novo = StatusLote.EM_TRIAGEM;
    } else if (anterior === StatusLote.EM_TRIAGEM) {
      novo = StatusLote.TRIAGEM_CONCLUIDA;
    } else {
      throw new ErroRegraNegocio(`A triagem deste lote já foi concluída (status atual: ${anterior}).`);
    }
    this.props.statusProcessamento = novo;
    return { anterior, novo };
  }

  /** Após a triagem: FINALIZADO se todos estão em destino final, ENCAMINHADO se algum já saiu de EM_TRIAGEM. */
  public static statusDerivado(atual: StatusLote, statusEquipamentos: StatusRastreamento[]): StatusLote {
    if (atual !== StatusLote.TRIAGEM_CONCLUIDA && atual !== StatusLote.ENCAMINHADO) return atual;
    if (statusEquipamentos.length > 0 && statusEquipamentos.every((s) => STATUS_RASTREAMENTO_FINAIS.includes(s))) {
      return StatusLote.FINALIZADO;
    }
    if (statusEquipamentos.some((s) => s !== StatusRastreamento.EM_TRIAGEM)) return StatusLote.ENCAMINHADO;
    return atual;
  }

  public static statusEhTriado(status: StatusLote): boolean {
    return Lote.STATUS_TRIADOS.includes(status);
  }

  public static calcularPesoTotal(equipamentos: { pesoQuilogramas: number }[]): number {
    return arredondar2(equipamentos.reduce((total, e) => total + e.pesoQuilogramas, 0));
  }

  public get id(): string {
    return this.props.id;
  }
  public get organizacaoId(): string {
    return this.props.organizacaoId;
  }
  public get statusProcessamento(): StatusLote {
    return this.props.statusProcessamento;
  }
  public get versao(): number {
    return this.props.versao;
  }

  public paraJSON(): PropsLote {
    return { ...this.props };
  }
}
