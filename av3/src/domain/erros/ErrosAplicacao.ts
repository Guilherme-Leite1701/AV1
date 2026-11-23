/** Cada erro carrega o próprio status HTTP; o tratadorErros faz a conversão. */
export abstract class ErroAplicacao extends Error {
  public abstract readonly statusCode: number;
  public readonly detalhes?: unknown;

  constructor(mensagem: string, detalhes?: unknown) {
    super(mensagem);
    this.name = new.target.name;
    this.detalhes = detalhes;
  }
}

export class ErroValidacao extends ErroAplicacao {
  public readonly statusCode = 400;
}

export class ErroNaoAutenticado extends ErroAplicacao {
  public readonly statusCode = 401;
}

export class ErroAcessoNegado extends ErroAplicacao {
  public readonly statusCode = 403;
}

export class ErroNaoEncontrado extends ErroAplicacao {
  public readonly statusCode = 404;

  constructor(entidade: string, id: string) {
    super(`${entidade} "${id}" não encontrado(a).`);
  }
}

export class ErroConflito extends ErroAplicacao {
  public readonly statusCode = 409;
}

/** Versão enviada pelo cliente está desatualizada (optimistic locking). */
export class ConflitoConcorrenciaError extends ErroConflito {
  constructor(entidade: string, id: string, versaoEnviada: number) {
    super(
      `${entidade} "${id}" foi alterado(a) por outra operação (versão ${versaoEnviada} desatualizada). ` +
        'Recarregue o registro e tente novamente.',
      { entidade, id, versaoEnviada },
    );
  }
}

export class ErroRegraNegocio extends ErroAplicacao {
  public readonly statusCode = 422;
}

/** AV3: o recurso existiu, mas o prazo de disponibilidade acabou (ex.: relatório expirado). */
export class ErroRecursoExpirado extends ErroAplicacao {
  public readonly statusCode = 410;
}

/** AV3: limite de requisições da chave de API (ou do IP) estourado. */
export class ErroLimiteRequisicoes extends ErroAplicacao {
  public readonly statusCode = 429;
}

/** AV3: falha de tarefa assíncrona que não adianta repetir (a fila não faz retry). */
export class ErroTarefaIrrecuperavel extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroTarefaIrrecuperavel';
  }
}

/** AV3: dependência externa (fila/Redis) fora do ar. */
export class ErroServicoIndisponivel extends ErroAplicacao {
  public readonly statusCode = 503;
}
