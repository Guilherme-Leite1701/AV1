import { Credencial } from '../autenticacao/Credencial';
import { Sessao } from '../autenticacao/Sessao';
import { Usuario } from '../autenticacao/Usuario';
import { PapelUsuario } from '../enums/PapelUsuario';
import { FabricaObjetos } from '../fabricas/FabricaObjetos';
import { ARQUIVOS } from '../persistencia/arquivos';
import { ConfiguracaoMestre } from '../persistencia/ConfiguracaoMestre';
import { RepositorioArquivo } from '../persistencia/RepositorioArquivo';

/**
 * Login, sessões e contas de acesso (FR01, FR10).
 * O administrador inicial fica no arquivo mestre; os demais usuários
 * ficam em "credenciais.dat", separado e cifrado.
 */
export class ServicoAutenticacao {
  private credenciais: Credencial[];
  private sessoesAtivas: Sessao[] = [];
  private usuariosLogados = new Map<string, Usuario>(); // token → usuário

  private repositorio: RepositorioArquivo;
  private configuracao: ConfiguracaoMestre;

  constructor(repositorio: RepositorioArquivo, configuracao: ConfiguracaoMestre) {
    this.repositorio = repositorio;
    this.configuracao = configuracao;
    this.credenciais = this.carregarCredenciais();
  }

  public login(usuario: string, senha: string): Sessao {
    const credencial = this.credenciais.find((c) => c.getUsuario() === usuario);
    const conta = credencial ? FabricaObjetos.criarUsuario(credencial) : null;
    // Mesma mensagem nos dois casos, para não revelar quais usuários existem.
    if (!conta || !conta.autenticar(usuario, senha)) {
      throw new Error('Usuário ou senha inválidos.');
    }
    const sessao = conta.getSessao() as Sessao;
    this.sessoesAtivas.push(sessao);
    this.usuariosLogados.set(sessao.getToken(), conta);
    this.repositorio.definirUsuario(usuario);
    return sessao;
  }

  public logout(token: string): void {
    this.sessoesAtivas = this.sessoesAtivas.filter((s) => s.getToken() !== token);
    this.usuariosLogados.delete(token);
    this.repositorio.definirUsuario('sistema');
  }

  /** Verifica se o token existe e não expirou; sessões expiradas são encerradas. */
  public validarToken(token: string): boolean {
    const sessao = this.sessoesAtivas.find((s) => s.getToken() === token);
    if (!sessao) return false;
    if (!sessao.isValida()) {
      this.logout(token);
      return false;
    }
    return true;
  }

  /** Devolve o usuário (Administrador, Auditor...) dono de uma sessão válida. */
  public obterUsuario(token: string): Usuario | null {
    return this.validarToken(token) ? (this.usuariosLogados.get(token) ?? null) : null;
  }

  public alterarSenha(usuario: string, senhaAntiga: string, senhaNova: string): boolean {
    const atual = this.credenciais.find((c) => c.getUsuario() === usuario);
    if (!atual || !atual.verificarSenha(senhaAntiga)) return false;

    if (usuario === this.configuracao.getAdministrador().getUsuario()) {
      this.configuracao.alterarSenhaAdministrador(senhaNova);
    } else {
      this.salvarCredencial(Credencial.criar(usuario, senhaNova, atual.getPapel()));
    }
    this.credenciais = this.carregarCredenciais();
    return true;
  }

  /** Cadastro de novas contas (exclusivo do Administrador, controlado pela CLI). */
  public criarUsuario(usuario: string, senha: string, papel: PapelUsuario): void {
    if (this.credenciais.some((c) => c.getUsuario() === usuario)) {
      throw new Error(`O usuário "${usuario}" já existe.`);
    }
    this.salvarCredencial(Credencial.criar(usuario, senha, papel));
    this.credenciais = this.carregarCredenciais();
  }

  public listarUsuarios(): { usuario: string; papel: PapelUsuario }[] {
    return this.credenciais.map((c) => ({ usuario: c.getUsuario(), papel: c.getPapel() }));
  }

  private carregarCredenciais(): Credencial[] {
    const demais = this.repositorio.listarEntidades(ARQUIVOS.CREDENCIAIS).map((d) => Credencial.reconstruir(d));
    return [this.configuracao.getAdministrador(), ...demais];
  }

  private salvarCredencial(credencial: Credencial): void {
    // O repositório identifica registros por "id"; aqui o id é o nome do usuário.
    this.repositorio.salvarEntidade(ARQUIVOS.CREDENCIAIS, {
      id: credencial.getUsuario(),
      ...JSON.parse(JSON.stringify(credencial)),
    });
  }
}
