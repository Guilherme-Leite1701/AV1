import { EstadoFisico, indiceEstadoFisico } from '../enums/EstadoFisico';
import { StatusLote } from '../enums/StatusLote';
import { STATUS_RASTREAMENTO_FINAIS, StatusRastreamento } from '../enums/StatusRastreamento';
import { TipoEquipamento } from '../enums/TipoEquipamento';
import { ErroRegraNegocio, ErroValidacao } from '../erros/ErrosAplicacao';
import { arredondar2 } from '../utils/datas';
import { TabelaValoracao } from '../valoracao/TabelaValoracao';
import { Lote } from './Lote';

export interface PropsEquipamento {
  id: string;
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  loteId: string;
  posicaoNoLote: number;
  statusRastreamento: StatusRastreamento;
  versao: number;
}

export type DadosNovoEquipamento = Pick<
  PropsEquipamento,
  'tipo' | 'marca' | 'modelo' | 'anoFabricacao' | 'estadoFisico' | 'pesoQuilogramas'
>;

export interface ResultadoDepreciacao {
  idade: number;
  coeficienteAnual: number;
  valorBase: number;
  fatorEstado: number;
  valorAtual: number;
  percentualDepreciacao: number;
}

export interface MudancaEstado<T> {
  anterior: T;
  novo: T;
}

export class Equipamento {
  public static readonly TAMANHO_MINIMO_JUSTIFICATIVA = 15;
  public static readonly ANO_FABRICACAO_MINIMO = 1970;

  public static readonly STATUS_FINAIS = STATUS_RASTREAMENTO_FINAIS;

  private static readonly STATUS_DESMONTE: readonly StatusRastreamento[] = [
    StatusRastreamento.AGUARDANDO_DESMONTE,
    StatusRastreamento.EM_DESMONTE,
  ];

  private props: PropsEquipamento;

  constructor(props: PropsEquipamento) {
    this.props = { ...props };
  }

  public static validarNovo(dados: DadosNovoEquipamento, anoAtual: number = new Date().getFullYear()): void {
    if (!Number.isFinite(dados.pesoQuilogramas) || dados.pesoQuilogramas <= 0) {
      throw new ErroRegraNegocio('O peso do equipamento deve ser maior que zero.');
    }
    if (
      !Number.isInteger(dados.anoFabricacao) ||
      dados.anoFabricacao < Equipamento.ANO_FABRICACAO_MINIMO ||
      dados.anoFabricacao > anoAtual
    ) {
      throw new ErroRegraNegocio(
        `Ano de fabricação inválido (${dados.anoFabricacao}): deve estar entre ${Equipamento.ANO_FABRICACAO_MINIMO} e ${anoAtual}.`,
      );
    }
    if (!dados.marca?.trim() || !dados.modelo?.trim()) {
      throw new ErroValidacao('Marca e modelo são obrigatórios.');
    }
  }

  /** Queda de 2+ níveis exige justificativa com 15+ caracteres (senão, 422). */
  public alterarEstadoFisico(novoEstado: EstadoFisico, justificativa?: string): MudancaEstado<EstadoFisico> & { queda: number } {
    this.garantirAlteravel();
    const anterior = this.props.estadoFisico;
    if (novoEstado === anterior) {
      throw new ErroRegraNegocio(`O equipamento já está no estado ${novoEstado}.`);
    }
    const queda = indiceEstadoFisico(novoEstado) - indiceEstadoFisico(anterior);
    if (queda >= 2) {
      const texto = justificativa?.trim() ?? '';
      if (texto.length < Equipamento.TAMANHO_MINIMO_JUSTIFICATIVA) {
        throw new ErroRegraNegocio(
          `Queda brusca de ${queda} níveis (${anterior} → ${novoEstado}): informe uma justificativa ` +
            `com pelo menos ${Equipamento.TAMANHO_MINIMO_JUSTIFICATIVA} caracteres.`,
        );
      }
    }
    this.props.estadoFisico = novoEstado;
    return { anterior, novo: novoEstado, queda };
  }

  /** Usado pela triagem do lote. */
  public iniciarTriagem(): MudancaEstado<StatusRastreamento> {
    const anterior = this.props.statusRastreamento;
    if (anterior !== StatusRastreamento.AGUARDANDO_TRIAGEM) {
      throw new ErroRegraNegocio(`O equipamento ${this.props.codigoBarrasInterno} não está aguardando triagem (${anterior}).`);
    }
    this.props.statusRastreamento = StatusRastreamento.EM_TRIAGEM;
    return { anterior, novo: StatusRastreamento.EM_TRIAGEM };
  }

  /** BAIXA_DEFINITIVA é terminal; desmonte exige triagem (equipamento EM_TRIAGEM ou lote já triado). */
  public atualizarStatus(novoStatus: StatusRastreamento, statusLote: StatusLote): MudancaEstado<StatusRastreamento> {
    this.garantirAlteravel();
    const anterior = this.props.statusRastreamento;

    if (novoStatus === anterior) {
      throw new ErroRegraNegocio(`O equipamento já está com status ${novoStatus}.`);
    }
    if (novoStatus === StatusRastreamento.AGUARDANDO_TRIAGEM) {
      throw new ErroRegraNegocio('Um equipamento não pode voltar para AGUARDANDO_TRIAGEM.');
    }
    if (anterior === StatusRastreamento.AGUARDANDO_TRIAGEM) {
      throw new ErroRegraNegocio('Este equipamento ainda aguarda triagem: inicie a triagem do lote antes (POST /lotes/:id/triagem).');
    }
    if (Equipamento.STATUS_DESMONTE.includes(novoStatus)) {
      const vemDaTriagem = anterior === StatusRastreamento.EM_TRIAGEM;
      const avancaNoDesmonte =
        anterior === StatusRastreamento.AGUARDANDO_DESMONTE && novoStatus === StatusRastreamento.EM_DESMONTE;
      if (!vemDaTriagem && !avancaNoDesmonte && !Lote.statusEhTriado(statusLote)) {
        throw new ErroRegraNegocio(
          `Triagem obrigatória: para ir a ${novoStatus} o equipamento precisa estar EM_TRIAGEM ` +
            `ou o lote precisa ter concluído a triagem (status atual do lote: ${statusLote}).`,
        );
      }
    }

    this.props.statusRastreamento = novoStatus;
    return { anterior, novo: novoStatus };
  }

  public estaEmStatusFinal(): boolean {
    return Equipamento.STATUS_FINAIS.includes(this.props.statusRastreamento);
  }

  public garantirAlteravel(): void {
    if (this.props.statusRastreamento === StatusRastreamento.BAIXA_DEFINITIVA) {
      throw new ErroRegraNegocio('Equipamento com BAIXA_DEFINITIVA não pode mais ser alterado.');
    }
  }

  /** V_atual = V_base × (1 − min(0,90; idade × c_dep)) × F_estado */
  public calcularDepreciacao(
    coeficienteAnual: number = TabelaValoracao.COEFICIENTE_DEPRECIACAO_PADRAO,
    anoAtual: number = new Date().getFullYear(),
  ): ResultadoDepreciacao {
    const idade = Math.max(0, anoAtual - this.props.anoFabricacao);
    const valorBase = TabelaValoracao.VALOR_BASE_NOVO[this.props.tipo];
    const fatorEstado = TabelaValoracao.FATOR_CONSERVACAO[this.props.estadoFisico];
    const depreciacaoPorIdade = Math.min(TabelaValoracao.TETO_DEPRECIACAO_IDADE, idade * coeficienteAnual);
    const valorAtual = valorBase * (1 - depreciacaoPorIdade) * fatorEstado;
    return {
      idade,
      coeficienteAnual,
      valorBase,
      fatorEstado,
      valorAtual: arredondar2(valorAtual),
      percentualDepreciacao: arredondar2((1 - valorAtual / valorBase) * 100),
    };
  }

  /** peso × teor do tipo × R$/kg */
  public calcularBonusMetalNobre(): number {
    const kgMetal = this.props.pesoQuilogramas * TabelaValoracao.TEOR_METAL_NOBRE[this.props.tipo];
    return arredondar2(kgMetal * TabelaValoracao.BONUS_POR_KG_METAL_NOBRE);
  }

  public get id(): string {
    return this.props.id;
  }
  public get codigoBarrasInterno(): string {
    return this.props.codigoBarrasInterno;
  }
  public get tipo(): TipoEquipamento {
    return this.props.tipo;
  }
  public get estadoFisico(): EstadoFisico {
    return this.props.estadoFisico;
  }
  public get pesoQuilogramas(): number {
    return this.props.pesoQuilogramas;
  }
  public get loteId(): string {
    return this.props.loteId;
  }
  public get statusRastreamento(): StatusRastreamento {
    return this.props.statusRastreamento;
  }
  public get versao(): number {
    return this.props.versao;
  }

  public paraJSON(): PropsEquipamento {
    return { ...this.props };
  }
}
