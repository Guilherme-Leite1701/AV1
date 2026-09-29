import { Contrato } from './Contrato';

/**
 * Ator externo: geradores, operadores logísticos, desmontadores e compradores (FR02).
 * Associação: Organizacao --> Contrato (contrato vigente).
 */
export class Organizacao {
  private id: string;
  private razaoSocial: string;
  private cnpj: string;
  private inscricaoEstadual: string;
  private enderecoCompleto: string;
  private telefone: string;
  private email: string;
  private dataCadastro: Date;
  private ativo: boolean;
  private contratoVigente: Contrato;

  constructor(
    id: string,
    razaoSocial: string,
    cnpj: string,
    inscricaoEstadual: string,
    enderecoCompleto: string,
    telefone: string,
    email: string,
    contratoVigente: Contrato,
  ) {
    if (!razaoSocial?.trim()) throw new Error('Razão social é obrigatória.');
    if (contratoVigente.getOrganizacaoId() !== id) {
      throw new Error('O contrato informado pertence a outra organização.');
    }
    this.id = id;
    this.razaoSocial = razaoSocial;
    this.cnpj = cnpj;
    this.inscricaoEstadual = inscricaoEstadual;
    this.enderecoCompleto = enderecoCompleto;
    this.telefone = telefone;
    this.email = email;
    this.dataCadastro = new Date();
    this.ativo = true;
    this.contratoVigente = contratoVigente;
  }

  public alterarEndereco(novoEndereco: string): void {
    if (!novoEndereco?.trim()) throw new Error('Endereço não pode ser vazio.');
    this.enderecoCompleto = novoEndereco;
  }

  public desativar(): void {
    this.ativo = false;
  }

  /** Recria uma Organizacao a partir dos dados lidos do arquivo. */
  public static reconstruir(dados: any): Organizacao {
    const organizacao = new Organizacao(
      dados.id,
      dados.razaoSocial,
      dados.cnpj,
      dados.inscricaoEstadual,
      dados.enderecoCompleto,
      dados.telefone,
      dados.email,
      Contrato.reconstruir(dados.contratoVigente),
    );
    organizacao.dataCadastro = new Date(dados.dataCadastro);
    organizacao.ativo = Boolean(dados.ativo);
    return organizacao;
  }

  public getId(): string {
    return this.id;
  }

  public getRazaoSocial(): string {
    return this.razaoSocial;
  }

  public getCnpj(): string {
    return this.cnpj;
  }

  public getInscricaoEstadual(): string {
    return this.inscricaoEstadual;
  }

  public getEnderecoCompleto(): string {
    return this.enderecoCompleto;
  }

  public getTelefone(): string {
    return this.telefone;
  }

  public getEmail(): string {
    return this.email;
  }

  public getDataCadastro(): Date {
    return this.dataCadastro;
  }

  public isAtivo(): boolean {
    return this.ativo;
  }

  public getContratoVigente(): Contrato {
    return this.contratoVigente;
  }
}
