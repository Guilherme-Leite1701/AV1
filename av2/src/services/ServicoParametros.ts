import { ErroNaoEncontrado, ErroValidacao } from '../domain/erros/ErrosAplicacao';
import {
  ChaveParametro,
  PARAMETROS_GLOBAIS,
  ehChaveParametro,
  valoresPadraoParametros,
} from '../domain/valoracao/ParametrosGlobais';
import { GerenciadorTransacao } from '../repositories/infra';
import { JournalRepository } from '../repositories/JournalRepository';
import { ParametroRepository } from '../repositories/ParametroRepository';
import { UsuarioAutenticado } from './tipos';

export class ServicoParametros {
  constructor(
    private readonly parametros: ParametroRepository,
    private readonly journal: JournalRepository,
    private readonly transacao: GerenciadorTransacao,
  ) {}

  public listar() {
    return this.parametros.listar();
  }

  /** Valores atuais, ou o padrão de cada parâmetro ausente. */
  public obterValores(): Promise<Record<ChaveParametro, number>> {
    return this.parametros.obterValores(valoresPadraoParametros());
  }

  public async atualizar(chave: string, valor: number, quem: UsuarioAutenticado) {
    if (!ehChaveParametro(chave)) throw new ErroNaoEncontrado('Parâmetro', chave);
    const definicao = PARAMETROS_GLOBAIS[chave];
    if (!Number.isFinite(valor) || valor < definicao.minimo || valor > definicao.maximo) {
      throw new ErroValidacao(`O parâmetro ${chave} deve estar entre ${definicao.minimo} e ${definicao.maximo}.`);
    }

    return this.transacao.executar(async (tx) => {
      const antes = await this.parametros.buscarPorChave(chave, tx);
      if (!antes) throw new ErroNaoEncontrado('Parâmetro', chave);
      const depois = await this.parametros.atualizarValor(chave, valor, tx);
      await this.journal.registrar(
        { operacao: 'ATUALIZAR', entidade: 'ParametroGlobal', dadosAntes: antes, dadosDepois: depois, usuarioResponsavel: quem.usuario },
        tx,
      );
      return depois;
    });
  }
}
