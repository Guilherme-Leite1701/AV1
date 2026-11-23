import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { EscopoApi } from '../enums/EscopoApi';
import { ErroAcessoNegado, ErroNaoAutenticado, ErroValidacao } from '../erros/ErrosAplicacao';

export interface PropsChaveApi {
  id: string;
  nome: string;
  prefixo: string;
  hashChave: string;
  escopos: EscopoApi[];
  organizacaoId: string | null;
  limitePorMinuto: number;
  segredoWebhook: string;
  ativa: boolean;
  criadaPor: string;
  criadaEm: Date;
  expiraEm: Date | null;
  ultimoUsoEm: Date | null;
  revogadaEm: Date | null;
  versao: number;
}

/** O que é gerado ao emitir uma chave: o texto só é mostrado ao parceiro uma vez. */
export interface ChaveGerada {
  textoChave: string;
  prefixo: string;
  hashChave: string;
  segredoWebhook: string;
}

/**
 * Chave de API de parceiro no formato gc_<prefixo 8 hex>_<segredo 43 base64url>.
 * O prefixo é público (identifica a chave nos logs); o banco guarda só o SHA-256 do texto inteiro.
 */
export class ChaveApi {
  public static readonly FORMATO = /^gc_([a-f0-9]{8})_([A-Za-z0-9_-]{43})$/;
  public static readonly LIMITE_MINIMO = 1;
  public static readonly LIMITE_MAXIMO = 10_000;

  private props: PropsChaveApi;

  constructor(props: PropsChaveApi) {
    this.props = { ...props, escopos: [...props.escopos] };
  }

  /** Gera uma chave nova com 256 bits de entropia no segredo. */
  public static gerar(): ChaveGerada {
    const prefixo = randomBytes(4).toString('hex');
    const segredo = randomBytes(32).toString('base64url');
    const textoChave = `gc_${prefixo}_${segredo}`;
    return { textoChave, prefixo, hashChave: ChaveApi.calcularHash(textoChave), segredoWebhook: randomBytes(32).toString('hex') };
  }

  /** Extrai o prefixo; null se o texto não tem o formato de uma chave do greencode. */
  public static extrairPrefixo(textoChave: string): string | null {
    return ChaveApi.FORMATO.exec(textoChave)?.[1] ?? null;
  }

  /**
   * SHA-256 sem salt: o segredo já é aleatório (256 bits), então não existe
   * dicionário possível e o hash pode ser indexado para a busca.
   */
  public static calcularHash(textoChave: string): string {
    return createHash('sha256').update(textoChave).digest('hex');
  }

  /** Valida os dados de emissão antes de gravar. */
  public static validarEmissao(
    dados: { nome: string; escopos: EscopoApi[]; limitePorMinuto: number; expiraEm?: Date | null },
    agora: Date,
  ): void {
    if (!dados.nome?.trim()) throw new ErroValidacao('Informe o nome do parceiro.');
    if (!dados.escopos?.length) throw new ErroValidacao('A chave precisa de pelo menos um escopo.');
    if (
      !Number.isInteger(dados.limitePorMinuto) ||
      dados.limitePorMinuto < ChaveApi.LIMITE_MINIMO ||
      dados.limitePorMinuto > ChaveApi.LIMITE_MAXIMO
    ) {
      throw new ErroValidacao(`O limite por minuto deve ser um inteiro entre ${ChaveApi.LIMITE_MINIMO} e ${ChaveApi.LIMITE_MAXIMO}.`);
    }
    if (dados.expiraEm && dados.expiraEm.getTime() <= agora.getTime()) {
      throw new ErroValidacao('A data de expiração deve estar no futuro.');
    }
  }

  /** Compara o hash em tempo constante (evita ataque de temporização). */
  public confere(textoChave: string): boolean {
    const calculado = Buffer.from(ChaveApi.calcularHash(textoChave), 'hex');
    const armazenado = Buffer.from(this.props.hashChave, 'hex');
    return calculado.length === armazenado.length && timingSafeEqual(calculado, armazenado);
  }

  /** 401 se a chave foi revogada, desativada ou expirou. */
  public garantirUtilizavel(agora: Date): void {
    if (this.props.revogadaEm || !this.props.ativa) throw new ErroNaoAutenticado('Chave de API revogada.');
    if (this.props.expiraEm && this.props.expiraEm.getTime() <= agora.getTime()) {
      throw new ErroNaoAutenticado('Chave de API expirada. Solicite uma nova ao greencode.');
    }
  }

  /** Atualiza o último uso em memória (o serviço grava no banco). */
  public registrarUso(agora: Date): void {
    this.props.ultimoUsoEm = agora;
  }

  public possuiEscopo(escopo: EscopoApi): boolean {
    return this.props.escopos.includes(escopo);
  }

  /** 403 se o contrato do parceiro não inclui o escopo. */
  public garantirEscopo(escopo: EscopoApi): void {
    if (!this.possuiEscopo(escopo)) {
      throw new ErroAcessoNegado(
        `A chave ${this.props.prefixo} não possui o escopo ${escopo}. Escopos contratados: ${this.props.escopos.join(', ')}.`,
      );
    }
  }

  /**
   * Organização cujos dados a requisição pode ver: a da chave, ou (só para chave global)
   * a informada pelo parceiro. Uma chave vinculada nunca enxerga outra organização.
   */
  public resolverOrganizacao(solicitada?: string): string | undefined {
    if (this.props.organizacaoId) {
      if (solicitada && solicitada !== this.props.organizacaoId) {
        throw new ErroAcessoNegado('Esta chave só pode acessar os dados da própria organização.');
      }
      return this.props.organizacaoId;
    }
    return solicitada;
  }

  /** Verdadeiro se a chave pode ver dados da organização informada. */
  public enxergaOrganizacao(organizacaoId: string): boolean {
    return this.props.organizacaoId === null || this.props.organizacaoId === organizacaoId;
  }

  public get id(): string {
    return this.props.id;
  }
  public get prefixo(): string {
    return this.props.prefixo;
  }
  public get organizacaoId(): string | null {
    return this.props.organizacaoId;
  }
  public get limitePorMinuto(): number {
    return this.props.limitePorMinuto;
  }
  public get segredoWebhook(): string {
    return this.props.segredoWebhook;
  }
  public get ultimoUsoEm(): Date | null {
    return this.props.ultimoUsoEm;
  }
  public get versao(): number {
    return this.props.versao;
  }
  /** Nome usado como responsável no journal e nas movimentações. */
  public get identificacao(): string {
    return `api:${this.props.prefixo}`;
  }

  /** Sem hash e sem segredo de webhook. */
  public paraVisaoPublica() {
    const { hashChave: _hash, segredoWebhook: _segredo, ...visivel } = this.props;
    return visivel;
  }
}
