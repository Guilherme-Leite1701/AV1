import { Credencial } from '../domain/entidades/Credencial';
import { PapelUsuario } from '../domain/enums/PapelUsuario';
import { ErroConflito, ErroNaoAutenticado, ErroNaoEncontrado, ErroRegraNegocio } from '../domain/erros/ErrosAplicacao';
import { CredencialRepository } from '../repositories/CredencialRepository';
import { GerenciadorTransacao } from '../repositories/infra';
import { JournalRepository } from '../repositories/JournalRepository';
import { Relogio, UsuarioAutenticado, relogioDoSistema } from './tipos';

/** Assinatura do JWT, injetada a partir do @fastify/jwt. */
export type AssinadorToken = (payload: UsuarioAutenticado) => string;

export class ServicoAutenticacao {
  public static readonly EXPIRACAO_TOKEN = '30m';

  constructor(
    private readonly credenciais: CredencialRepository,
    private readonly journal: JournalRepository,
    private readonly transacao: GerenciadorTransacao,
    private readonly assinarToken: AssinadorToken,
    private readonly relogio: Relogio = relogioDoSistema,
  ) {}

  public async login(usuario: string, senha: string) {
    const credencial = await this.credenciais.buscarPorUsuario(usuario);
    // Mesma mensagem nos dois casos para não revelar quais usuários existem.
    if (!credencial || !credencial.verificarSenha(senha)) {
      throw new ErroNaoAutenticado('Usuário ou senha inválidos.');
    }
    await this.credenciais.registrarAcesso(credencial.id, this.relogio());
    const token = this.assinarToken({ id: credencial.id, usuario: credencial.usuario, papel: credencial.papel });
    return {
      token,
      tipo: 'Bearer',
      expiraEm: ServicoAutenticacao.EXPIRACAO_TOKEN,
      usuario: { id: credencial.id, usuario: credencial.usuario, papel: credencial.papel },
    };
  }

  public async alterarSenha(quem: UsuarioAutenticado, senhaAtual: string, senhaNova: string): Promise<void> {
    if (senhaAtual === senhaNova) throw new ErroRegraNegocio('A nova senha deve ser diferente da atual.');

    await this.transacao.executar(async (tx) => {
      const credencial = await this.credenciais.buscarPorId(quem.id, tx);
      if (!credencial) throw new ErroNaoEncontrado('Credencial', quem.id);
      if (!credencial.verificarSenha(senhaAtual)) throw new ErroRegraNegocio('A senha atual está incorreta.');

      const novo = Credencial.gerarHashComSalt(senhaNova);
      await this.credenciais.atualizarSenha(credencial.id, credencial.versao, novo, tx);
      // Hash e salt nunca vão para o journal.
      await this.journal.registrar(
        {
          operacao: 'ALTERAR_SENHA',
          entidade: 'Credencial',
          dadosAntes: { id: credencial.id, usuario: credencial.usuario, versao: credencial.versao },
          dadosDepois: { id: credencial.id, usuario: credencial.usuario, versao: credencial.versao + 1 },
          usuarioResponsavel: quem.usuario,
        },
        tx,
      );
    });
  }

  public async criarUsuario(dados: { usuario: string; senha: string; papel: PapelUsuario }, quem: UsuarioAutenticado) {
    const novos = Credencial.gerarDados(dados.usuario, dados.senha, dados.papel);
    return this.transacao.executar(async (tx) => {
      if (await this.credenciais.buscarPorUsuario(novos.usuario, tx)) {
        throw new ErroConflito(`O usuário "${novos.usuario}" já existe.`);
      }
      const credencial = await this.credenciais.criar(novos, tx);
      await this.journal.registrar(
        { operacao: 'CRIAR', entidade: 'Credencial', dadosDepois: credencial.paraVisaoPublica(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return credencial.paraVisaoPublica();
    });
  }

  public async listarUsuarios() {
    return (await this.credenciais.listar()).map((c) => c.paraVisaoPublica());
  }
}
