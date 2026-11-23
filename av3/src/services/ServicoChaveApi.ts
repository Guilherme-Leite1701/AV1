import { ChaveApi } from '../domain/entidades/ChaveApi';
import { EscopoApi } from '../domain/enums/EscopoApi';
import { ErroNaoAutenticado, ErroNaoEncontrado } from '../domain/erros/ErrosAplicacao';
import { ChaveApiRepository } from '../repositories/ChaveApiRepository';
import { GerenciadorTransacao } from '../repositories/infra';
import { JournalRepository } from '../repositories/JournalRepository';
import { OrganizacaoRepository } from '../repositories/OrganizacaoRepository';
import { Relogio, UsuarioAutenticado, relogioDoSistema } from './tipos';

export interface DadosEmissaoChave {
  nome: string;
  escopos: EscopoApi[];
  organizacaoId?: string | null;
  limitePorMinuto?: number;
  expiraEm?: Date | null;
}

interface EntradaCache {
  chave: ChaveApi;
  validaAte: number;
}

/**
 * Emissão, revogação e autenticação das chaves de parceiros.
 * A autenticação usa um cache curto em memória para não ir ao banco em toda requisição;
 * uma revogação leva no máximo TTL_CACHE_MS para valer nas outras instâncias.
 */
export class ServicoChaveApi {
  public static readonly TTL_CACHE_MS = 30_000;
  public static readonly INTERVALO_REGISTRO_USO_MS = 60_000;
  public static readonly LIMITE_PADRAO_POR_MINUTO = 60;

  private readonly cache = new Map<string, EntradaCache>();

  constructor(
    private readonly chaves: ChaveApiRepository,
    private readonly organizacoes: OrganizacaoRepository,
    private readonly journal: JournalRepository,
    private readonly transacao: GerenciadorTransacao,
    private readonly relogio: Relogio = relogioDoSistema,
  ) {}

  /** Emite a chave; o texto completo é devolvido só nesta resposta e nunca vai para o journal. */
  public async emitir(dados: DadosEmissaoChave, quem: UsuarioAutenticado) {
    const agora = this.relogio();
    const limitePorMinuto = dados.limitePorMinuto ?? ServicoChaveApi.LIMITE_PADRAO_POR_MINUTO;
    const escopos = [...new Set(dados.escopos)];
    ChaveApi.validarEmissao({ ...dados, escopos, limitePorMinuto }, agora);

    return this.transacao.executar(async (tx) => {
      if (dados.organizacaoId) {
        const organizacao = await this.organizacoes.buscarPorId(dados.organizacaoId, tx);
        if (!organizacao) throw new ErroNaoEncontrado('Organização', dados.organizacaoId);
        organizacao.garantirAtiva();
      }
      const gerada = ChaveApi.gerar();
      const chave = await this.chaves.criar(
        {
          nome: dados.nome.trim(),
          prefixo: gerada.prefixo,
          hashChave: gerada.hashChave,
          segredoWebhook: gerada.segredoWebhook,
          escopos,
          organizacaoId: dados.organizacaoId ?? null,
          limitePorMinuto,
          expiraEm: dados.expiraEm ?? null,
          criadaPor: quem.usuario,
        },
        tx,
      );
      await this.journal.registrar(
        { operacao: 'CRIAR', entidade: 'ChaveApi', dadosDepois: chave.paraVisaoPublica(), usuarioResponsavel: quem.usuario },
        tx,
      );
      return {
        ...chave.paraVisaoPublica(),
        chave: gerada.textoChave,
        segredoWebhook: gerada.segredoWebhook,
        aviso: 'Guarde a chave e o segredo do webhook agora: eles não serão exibidos novamente.',
      };
    });
  }

  public async listar(filtro: { organizacaoId?: string; incluirRevogadas: boolean }) {
    return (await this.chaves.listar(filtro)).map((c) => c.paraVisaoPublica());
  }

  /** Revogação definitiva; o cache local é limpo na hora. */
  public async revogar(id: string, versao: number, quem: UsuarioAutenticado) {
    return this.transacao.executar(async (tx) => {
      const antes = await this.chaves.buscarPorId(id, tx);
      if (!antes) throw new ErroNaoEncontrado('Chave de API', id);
      const depois = await this.chaves.revogar(id, versao, this.relogio(), tx);
      await this.journal.registrar(
        {
          operacao: 'REVOGAR',
          entidade: 'ChaveApi',
          dadosAntes: antes.paraVisaoPublica(),
          dadosDepois: depois.paraVisaoPublica(),
          usuarioResponsavel: quem.usuario,
        },
        tx,
      );
      this.invalidarCache(id);
      return depois.paraVisaoPublica();
    });
  }

  /**
   * Autentica o texto recebido no cabeçalho X-API-Key.
   * Formato inválido nem chega ao banco; a mensagem de erro é a mesma para chave inexistente.
   */
  public async autenticar(textoChave: string | undefined): Promise<ChaveApi> {
    if (!textoChave) throw new ErroNaoAutenticado('Envie a chave no cabeçalho "X-API-Key".');
    if (!ChaveApi.extrairPrefixo(textoChave)) throw new ErroNaoAutenticado('Chave de API inválida.');

    const agora = this.relogio();
    const hash = ChaveApi.calcularHash(textoChave);
    let chave = this.lerCache(hash, agora.getTime());
    if (!chave) {
      chave = await this.chaves.buscarPorHash(hash);
      if (!chave || !chave.confere(textoChave)) throw new ErroNaoAutenticado('Chave de API inválida.');
      this.cache.set(hash, { chave, validaAte: agora.getTime() + ServicoChaveApi.TTL_CACHE_MS });
    }
    chave.garantirUtilizavel(agora);
    await this.registrarUsoSeNecessario(chave, agora);
    return chave;
  }

  /** Grava o último uso no máximo uma vez por minuto (evita um UPDATE por requisição). */
  private async registrarUsoSeNecessario(chave: ChaveApi, agora: Date): Promise<void> {
    const ultimo = chave.ultimoUsoEm?.getTime() ?? 0;
    if (agora.getTime() - ultimo < ServicoChaveApi.INTERVALO_REGISTRO_USO_MS) return;
    chave.registrarUso(agora);
    await this.chaves.registrarUso(chave.id, agora);
  }

  private lerCache(hash: string, agoraMs: number): ChaveApi | null {
    const entrada = this.cache.get(hash);
    if (!entrada) return null;
    if (entrada.validaAte < agoraMs) {
      this.cache.delete(hash);
      return null;
    }
    return entrada.chave;
  }

  private invalidarCache(id: string): void {
    for (const [hash, entrada] of this.cache) if (entrada.chave.id === id) this.cache.delete(hash);
  }
}
