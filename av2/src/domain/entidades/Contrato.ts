import { ErroRegraNegocio, ErroValidacao } from '../erros/ErrosAplicacao';
import { adicionarMeses, arredondar2 } from '../utils/datas';

export interface PropsContrato {
  id: string;
  organizacaoId: string;
  dataAssinatura: Date;
  dataVencimento: Date;
  clausulas: string[];
  valorMensal: number;
  renovacaoAutomatica: boolean;
  versao: number;
}

export type SituacaoRecebimento = { renovado: false } | { renovado: true; vencimentoAnterior: Date; novoVencimento: Date };

export class Contrato {
  public static readonly MESES_RENOVACAO_AUTOMATICA = 12;
  private static readonly MS_POR_MES_MEDIO = (365.25 / 12) * 24 * 60 * 60 * 1000;

  private props: PropsContrato;

  constructor(props: PropsContrato) {
    Contrato.validar(props);
    this.props = { ...props, clausulas: [...props.clausulas] };
  }

  public static validar(dados: Pick<PropsContrato, 'dataAssinatura' | 'dataVencimento' | 'valorMensal' | 'clausulas'>): void {
    if (isNaN(dados.dataAssinatura.getTime()) || isNaN(dados.dataVencimento.getTime())) {
      throw new ErroValidacao('Datas do contrato inválidas.');
    }
    if (dados.dataVencimento.getTime() <= dados.dataAssinatura.getTime()) {
      throw new ErroValidacao('A data de vencimento deve ser posterior à data de assinatura.');
    }
    if (!Number.isFinite(dados.valorMensal) || dados.valorMensal < 0) {
      throw new ErroValidacao('O valor mensal do contrato não pode ser negativo.');
    }
    if (!Array.isArray(dados.clausulas) || dados.clausulas.some((c) => typeof c !== 'string')) {
      throw new ErroValidacao('As cláusulas devem ser uma lista de textos.');
    }
  }

  public estaVigente(agora: Date = new Date()): boolean {
    const t = agora.getTime();
    return this.props.dataAssinatura.getTime() <= t && t <= this.props.dataVencimento.getTime();
  }

  public renovar(novoVencimento: Date): void {
    if (isNaN(novoVencimento.getTime()) || novoVencimento.getTime() <= this.props.dataVencimento.getTime()) {
      throw new ErroRegraNegocio('O novo vencimento deve ser posterior ao vencimento atual.');
    }
    this.props.dataVencimento = novoVencimento;
  }

  /** Vigente: libera. Vencido com renovação automática: renova +12 meses. Vencido sem renovação: 422. */
  public avaliarRecebimentoDeLote(agora: Date = new Date()): SituacaoRecebimento {
    if (this.estaVigente(agora)) return { renovado: false };

    if (agora.getTime() < this.props.dataAssinatura.getTime()) {
      throw new ErroRegraNegocio('O contrato da organização ainda não entrou em vigor.');
    }
    if (!this.props.renovacaoAutomatica) {
      throw new ErroRegraNegocio(
        `O contrato da organização venceu em ${this.props.dataVencimento.toISOString().slice(0, 10)} ` +
          'e não possui renovação automática. Renove o contrato antes de receber novos lotes.',
      );
    }
    const vencimentoAnterior = this.props.dataVencimento;
    const base = vencimentoAnterior.getTime() > agora.getTime() ? vencimentoAnterior : agora;
    const novoVencimento = adicionarMeses(base, Contrato.MESES_RENOVACAO_AUTOMATICA);
    this.props.dataVencimento = novoVencimento;
    return { renovado: true, vencimentoAnterior, novoVencimento };
  }

  /** Meses (fracionados) de vigência dentro do período. */
  public mesesVigentesNoPeriodo(inicio: Date, fim: Date): number {
    const ini = Math.max(inicio.getTime(), this.props.dataAssinatura.getTime());
    const fimEfetivo = Math.min(fim.getTime(), this.props.dataVencimento.getTime());
    if (fimEfetivo <= ini) return 0;
    return arredondar2((fimEfetivo - ini) / Contrato.MS_POR_MES_MEDIO);
  }

  public get id(): string {
    return this.props.id;
  }
  public get organizacaoId(): string {
    return this.props.organizacaoId;
  }
  public get dataAssinatura(): Date {
    return this.props.dataAssinatura;
  }
  public get dataVencimento(): Date {
    return this.props.dataVencimento;
  }
  public get clausulas(): string[] {
    return [...this.props.clausulas];
  }
  public get valorMensal(): number {
    return this.props.valorMensal;
  }
  public get renovacaoAutomatica(): boolean {
    return this.props.renovacaoAutomatica;
  }
  public get versao(): number {
    return this.props.versao;
  }

  public paraJSON(): PropsContrato & { vigente: boolean } {
    return { ...this.props, clausulas: [...this.props.clausulas], vigente: this.estaVigente() };
  }
}
