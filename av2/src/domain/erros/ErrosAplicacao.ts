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
