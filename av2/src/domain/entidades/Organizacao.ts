import { ErroRegraNegocio, ErroValidacao } from '../erros/ErrosAplicacao';
import { Contrato, PropsContrato } from './Contrato';

export interface PropsOrganizacao {
  id: string;
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
  dataCadastro: Date;
  ativo: boolean;
  versao: number;
}

export class Organizacao {
  private props: PropsOrganizacao;
  private readonly contrato: Contrato | null;

  constructor(props: PropsOrganizacao, contratoVigente: Contrato | null = null) {
    if (!props.razaoSocial?.trim()) throw new ErroValidacao('Razão social é obrigatória.');
    if (contratoVigente && contratoVigente.organizacaoId !== props.id) {
      throw new ErroValidacao('O contrato informado pertence a outra organização.');
    }
    this.props = { ...props };
    this.contrato = contratoVigente;
  }

  public alterarEndereco(novoEndereco: string): void {
    if (!novoEndereco?.trim()) throw new ErroValidacao('O endereço não pode ser vazio.');
    this.props.enderecoCompleto = novoEndereco.trim();
  }

  public desativar(): void {
    if (!this.props.ativo) throw new ErroRegraNegocio('A organização já está desativada.');
    this.props.ativo = false;
  }

  public garantirAtiva(): void {
    if (!this.props.ativo) {
      throw new ErroRegraNegocio(`A organização "${this.props.razaoSocial}" está desativada e não pode receber lotes.`);
    }
  }

  public obterContratoVigente(): Contrato {
    if (!this.contrato) {
      throw new ErroRegraNegocio(`A organização "${this.props.razaoSocial}" não possui contrato cadastrado.`);
    }
    return this.contrato;
  }

  public get id(): string {
    return this.props.id;
  }
  public get razaoSocial(): string {
    return this.props.razaoSocial;
  }
  public get cnpj(): string {
    return this.props.cnpj;
  }
  public get enderecoCompleto(): string {
    return this.props.enderecoCompleto;
  }
  public get ativo(): boolean {
    return this.props.ativo;
  }
  public get versao(): number {
    return this.props.versao;
  }
  public get contratoVigente(): Contrato | null {
    return this.contrato;
  }

  public paraJSON(): PropsOrganizacao & { contratoVigente: (PropsContrato & { vigente: boolean }) | null } {
    return { ...this.props, contratoVigente: this.contrato ? this.contrato.paraJSON() : null };
  }
}
