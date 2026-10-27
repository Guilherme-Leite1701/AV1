import { FastifyReply, FastifyRequest } from 'fastify';
import { PapelUsuario } from '../domain/enums/PapelUsuario';
import { ServicoAutenticacao } from '../services/ServicoAutenticacao';
import { ServicoParametros } from '../services/ServicoParametros';

export type RotaLogin = { Body: { usuario: string; senha: string } };
export type RotaAlterarSenha = { Body: { senhaAtual: string; senhaNova: string } };
export type RotaCriarUsuario = { Body: { usuario: string; senha: string; papel: PapelUsuario } };
export type RotaAtualizarParametro = { Params: { chave: string }; Body: { valorNumerico: number } };

export class AuthController {
  constructor(
    private readonly autenticacao: ServicoAutenticacao,
    private readonly parametros: ServicoParametros,
  ) {}

  public login = async (request: FastifyRequest<RotaLogin>) => {
    return this.autenticacao.login(request.body.usuario, request.body.senha);
  };

  public alterarSenha = async (
    request: FastifyRequest<RotaAlterarSenha>,
    reply: FastifyReply,
  ) => {
    await this.autenticacao.alterarSenha(request.user, request.body.senhaAtual, request.body.senhaNova);
    return reply.status(204).send();
  };

  public criarUsuario = async (
    request: FastifyRequest<RotaCriarUsuario>,
    reply: FastifyReply,
  ) => {
    const criado = await this.autenticacao.criarUsuario(request.body, request.user);
    return reply.status(201).send(criado);
  };

  public listarUsuarios = async () => this.autenticacao.listarUsuarios();

  public listarParametros = async () => this.parametros.listar();

  public atualizarParametro = async (request: FastifyRequest<RotaAtualizarParametro>) => {
    return this.parametros.atualizar(request.params.chave, request.body.valorNumerico, request.user);
  };
}
