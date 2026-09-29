import { randomUUID } from 'crypto';
import { Contrato } from '../dominio/Contrato';
import { Organizacao } from '../dominio/Organizacao';
import { ARQUIVOS } from '../persistencia/arquivos';
import { RepositorioArquivo } from '../persistencia/RepositorioArquivo';
import { ValidadorCNPJ } from '../validadores/ValidadorCNPJ';

/**
 * Cadastro e consulta de Organizações e seus Contratos (FR02, FR03).
 * O CNPJ (sem máscara) é o identificador da organização.
 */
export class ServicoOrganizacao {
  private repositorio: RepositorioArquivo;
  private validadorCNPJ: ValidadorCNPJ;

  constructor(repositorio: RepositorioArquivo, validadorCNPJ: ValidadorCNPJ) {
    this.repositorio = repositorio;
    this.validadorCNPJ = validadorCNPJ;
  }

  /**
   * Formato esperado de `dados`:
   * {
   *   razaoSocial, cnpj, inscricaoEstadual?, enderecoCompleto, telefone?, email?,
   *   contrato: { dataAssinatura, dataVencimento, clausulas?, valorMensal, renovacaoAutomatica? }
   * }
   */
  public cadastrarOrganizacao(dados: any): Organizacao {
    if (!this.validadorCNPJ.validar(dados?.cnpj)) {
      throw new Error(this.validadorCNPJ.obterMensagemErro());
    }
    const cnpj = ServicoOrganizacao.normalizarCNPJ(dados.cnpj);
    if (this.repositorio.carregarEntidade(ARQUIVOS.ORGANIZACOES, cnpj)) {
      throw new Error(`Já existe uma organização com o CNPJ ${cnpj}.`);
    }
    if (!dados.contrato) throw new Error('Os dados do contrato são obrigatórios.');

    const contrato = new Contrato(
      randomUUID(),
      cnpj,
      new Date(dados.contrato.dataAssinatura),
      new Date(dados.contrato.dataVencimento),
      dados.contrato.clausulas ?? [],
      Number(dados.contrato.valorMensal),
      Boolean(dados.contrato.renovacaoAutomatica),
    );
    const organizacao = new Organizacao(
      cnpj,
      dados.razaoSocial,
      cnpj,
      dados.inscricaoEstadual ?? '',
      dados.enderecoCompleto ?? '',
      dados.telefone ?? '',
      dados.email ?? '',
      contrato,
    );

    this.repositorio.salvarEntidade(ARQUIVOS.ORGANIZACOES, organizacao);
    return organizacao;
  }

  /** Aceita o CNPJ com ou sem máscara. */
  public buscarOrganizacao(id: string): Organizacao {
    const dados = this.repositorio.carregarEntidade(ARQUIVOS.ORGANIZACOES, ServicoOrganizacao.normalizarCNPJ(id));
    if (!dados) throw new Error(`Organização ${id} não encontrada.`);
    return Organizacao.reconstruir(dados);
  }

  public listarOrganizacoesAtivas(): Organizacao[] {
    return this.repositorio
      .listarEntidades(ARQUIVOS.ORGANIZACOES)
      .map((dados) => Organizacao.reconstruir(dados))
      .filter((o) => o.isAtivo());
  }

  public renovarContrato(organizacaoId: string, novoVencimento: Date): void {
    const organizacao = this.buscarOrganizacao(organizacaoId);
    organizacao.getContratoVigente().renovar(novoVencimento);
    this.repositorio.salvarEntidade(ARQUIVOS.ORGANIZACOES, organizacao);
  }

  public alterarEndereco(organizacaoId: string, novoEndereco: string): void {
    const organizacao = this.buscarOrganizacao(organizacaoId);
    organizacao.alterarEndereco(novoEndereco);
    this.repositorio.salvarEntidade(ARQUIVOS.ORGANIZACOES, organizacao);
  }

  public desativarOrganizacao(organizacaoId: string): void {
    const organizacao = this.buscarOrganizacao(organizacaoId);
    organizacao.desativar();
    this.repositorio.salvarEntidade(ARQUIVOS.ORGANIZACOES, organizacao);
  }

  private static normalizarCNPJ(cnpj: string): string {
    return String(cnpj).toUpperCase().replace(/[.\/\-\s]/g, '');
  }
}
