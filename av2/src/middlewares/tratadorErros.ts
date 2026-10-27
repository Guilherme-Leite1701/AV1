import { Prisma } from '@prisma/client';
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ErroAplicacao } from '../domain/erros/ErrosAplicacao';

interface CorpoErro {
  statusCode: number;
  erro: string;
  mensagem: string;
  detalhes?: unknown;
}

/** Converte qualquer exceção em { statusCode, erro, mensagem, detalhes? }. */
export function tratadorErros(erro: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const corpo = converterErro(erro);
  if (corpo.statusCode >= 500) {
    request.log.error({ err: erro }, 'Erro inesperado');
  } else {
    request.log.info({ statusCode: corpo.statusCode, erro: corpo.erro }, corpo.mensagem);
  }
  return reply.status(corpo.statusCode).send(corpo);
}

function converterErro(erro: unknown): CorpoErro {
  if (erro instanceof ErroAplicacao) {
    return { statusCode: erro.statusCode, erro: erro.name, mensagem: erro.message, detalhes: erro.detalhes };
  }

  const erroFastify = erro as Partial<FastifyError>;
  if (erroFastify.validation) {
    return {
      statusCode: 400,
      erro: 'ErroValidacao',
      mensagem: `Requisição inválida: ${erroFastify.message}`,
      detalhes: erroFastify.validation,
    };
  }

  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    switch (erro.code) {
      case 'P2002': // unique constraint
        return { statusCode: 409, erro: 'ErroConflito', mensagem: 'Registro duplicado.', detalhes: erro.meta };
      case 'P2025': // registro não encontrado
        return { statusCode: 404, erro: 'ErroNaoEncontrado', mensagem: 'Registro não encontrado.', detalhes: erro.meta };
      case 'P2003': // foreign key
        return { statusCode: 409, erro: 'ErroConflito', mensagem: 'O registro está vinculado a outros dados.', detalhes: erro.meta };
      case 'P2034': // conflito de escrita / deadlock
        return { statusCode: 409, erro: 'ConflitoConcorrenciaError', mensagem: 'Conflito de concorrência. Tente novamente.' };
      case 'P2004':
        return violacaoCheck(erro.message);
    }
  }
  if (erro instanceof Prisma.PrismaClientUnknownRequestError && /check constraint/i.test(erro.message)) {
    return violacaoCheck(erro.message);
  }

  if (typeof erroFastify.statusCode === 'number' && erroFastify.statusCode >= 400 && erroFastify.statusCode < 500) {
    return { statusCode: erroFastify.statusCode, erro: erroFastify.code ?? 'ErroRequisicao', mensagem: erroFastify.message ?? 'Requisição inválida.' };
  }

  return { statusCode: 500, erro: 'ErroInterno', mensagem: 'Erro interno do servidor.' };
}

/** CHECK do PostgreSQL violado (ex.: pesoQuilogramas <= 0) → 422. */
function violacaoCheck(mensagemOriginal: string): CorpoErro {
  const constraint = /constraint "([^"]+)"/.exec(mensagemOriginal)?.[1];
  return {
    statusCode: 422,
    erro: 'ErroRegraNegocio',
    mensagem: 'O banco de dados recusou o valor (constraint CHECK violada).',
    detalhes: constraint ? { constraint } : undefined,
  };
}
