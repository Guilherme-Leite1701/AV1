import { Contrato } from '../domain/entidades/Contrato';
import { ErroConflito, ErroNaoEncontrado, ErroValidacao } from '../domain/erros/ErrosAplicacao';
import { adicionarMeses } from '../domain/utils/datas';
import { ValidadorCNPJ } from '../domain/validadores/ValidadorCNPJ';
import { GerenciadorTransacao } from '../repositories/infra';
import { JournalRepository } from '../repositories/JournalRepository';
import { DadosNovaOrganizacao, DadosNovoContrato, OrganizacaoRepository } from '../repositories/OrganizacaoRepository';
import { UsuarioAutenticado } from './tipos';

export interface DadosCadastroOrganizacao extends Omit<DadosNovaOrganizacao, 'cnpj'> {
  cnpj: string;
  contrato: DadosNovoContrato;
}

export class ServicoOrganizacao {
  constructor(
    private readonly organizacoes: OrganizacaoRepository,
    private readonly journal: JournalRepository,
    private readonly transacao: GerenciadorTransacao,
    private readonly validadorCNPJ: ValidadorCNPJ = new ValidadorCNPJ(),
  ) {}

  /** Organização e contrato na mesma transação. */
  public async cadastrarOrganizacao(dados: DadosCadastroOrganizacao, quem: UsuarioAutenticado) {
    if (!this.validadorCNPJ.validar(dados.cnpj)) {
      throw new ErroValidacao(this.validadorCNPJ.obterMensagemErro());
    }
    const cnpj = ValidadorCNPJ.normalizar(dados.cnpj);
    Contrato.validar(dados.contrato);

    return this.transacao.executar(async (tx) => {
      if (await this.organizacoes.existeCnpj(cnpj, tx)) {
        throw new ErroConflito(`Já existe uma organização com o CNPJ ${cnpj}.`);
      }
      const { contrato, ...organizacao } = dados;
      const criada = await this.organizacoes.criarComContrato({ ...organizacao, cnpj }, contrato, tx);
      await this.journal.registrar(
        { operacao: 'CRIAR', entidade: 'Organizacao', dadosDepois: criada.paraJSON(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return criada.paraJSON();
    });
  }

  public async buscarOrganizacao(id: string) {
    const organizacao = await this.organizacoes.buscarPorId(id);
    if (!organizacao) throw new ErroNaoEncontrado('Organização', id);
    return organizacao.paraJSON();
  }

  public async listarOrganizacoes(incluirInativas = false) {
    const lista = await this.organizacoes.listar({ apenasAtivas: !incluirInativas });
    return lista.map((o) => o.paraJSON());
  }

  public async alterarEndereco(id: string, novoEndereco: string, versao: number, quem: UsuarioAutenticado) {
    return this.transacao.executar(async (tx) => {
      const organizacao = await this.organizacoes.buscarPorId(id, tx);
      if (!organizacao) throw new ErroNaoEncontrado('Organização', id);
      const antes = organizacao.paraJSON();
      organizacao.alterarEndereco(novoEndereco);
      const depois = await this.organizacoes.atualizar(id, versao, { enderecoCompleto: organizacao.enderecoCompleto }, tx);
      await this.journal.registrar(
        { operacao: 'ATUALIZAR', entidade: 'Organizacao', dadosAntes: antes, dadosDepois: depois.paraJSON(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return depois.paraJSON();
    });
  }

  /** Desativação lógica (soft delete). */
  public async desativarOrganizacao(id: string, versao: number, quem: UsuarioAutenticado) {
    return this.transacao.executar(async (tx) => {
      const organizacao = await this.organizacoes.buscarPorId(id, tx);
      if (!organizacao) throw new ErroNaoEncontrado('Organização', id);
      const antes = organizacao.paraJSON();
      organizacao.desativar();
      const depois = await this.organizacoes.atualizar(id, versao, { ativo: false }, tx);
      await this.journal.registrar(
        { operacao: 'DESATIVAR', entidade: 'Organizacao', dadosAntes: antes, dadosDepois: depois.paraJSON(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return depois.paraJSON();
    });
  }

  /** Sem `novoVencimento`, renova por +12 meses. `versao` é a versão do contrato. */
  public async renovarContrato(
    organizacaoId: string,
    dados: { versao: number; novoVencimento?: Date },
    quem: UsuarioAutenticado,
  ) {
    return this.transacao.executar(async (tx) => {
      const organizacao = await this.organizacoes.buscarPorId(organizacaoId, tx);
      if (!organizacao) throw new ErroNaoEncontrado('Organização', organizacaoId);
      const contrato = organizacao.obterContratoVigente();
      const antes = contrato.paraJSON();
      contrato.renovar(
        dados.novoVencimento ?? adicionarMeses(contrato.dataVencimento, Contrato.MESES_RENOVACAO_AUTOMATICA),
      );
      const renovado = await this.organizacoes.atualizarVencimentoContrato(contrato.id, dados.versao, contrato.dataVencimento, tx);
      await this.journal.registrar(
        { operacao: 'RENOVAR', entidade: 'Contrato', dadosAntes: antes, dadosDepois: renovado.paraJSON(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return renovado.paraJSON();
    });
  }
}
