import { FastifyInstance } from 'fastify';
import {
  AuthController,
  RotaAlterarSenha,
  RotaAtualizarParametro,
  RotaCriarUsuario,
  RotaLogin,
} from '../controllers/AuthController';
import { Credencial } from '../domain/entidades/Credencial';
import { PapelUsuario } from '../domain/enums/PapelUsuario';
import { PERMISSOES } from '../middlewares/exigirPapel';
import { autenticada, corpo, protegida, texto } from './comuns';

const senha = texto(Credencial.TAMANHO_MINIMO_SENHA, 200);

export function registrarRotasAuth(app: FastifyInstance, controller: AuthController): void {
  app.post<RotaLogin>(
    '/auth/login',
    { schema: { body: corpo({ usuario: texto(1, 30), senha: texto(1, 200) }, ['usuario', 'senha']) } },
    controller.login,
  );

  app.patch<RotaAlterarSenha>(
    '/auth/senha',
    { ...autenticada, schema: { body: corpo({ senhaAtual: texto(1, 200), senhaNova: senha }, ['senhaAtual', 'senhaNova']) } },
    controller.alterarSenha,
  );

  app.get('/usuarios', { ...protegida(PERMISSOES.GERENCIAR_USUARIOS) }, controller.listarUsuarios);

  app.post<RotaCriarUsuario>(
    '/usuarios',
    {
      ...protegida(PERMISSOES.GERENCIAR_USUARIOS),
      schema: {
        body: corpo(
          { usuario: texto(3, 30), senha, papel: { type: 'string', enum: Object.values(PapelUsuario) } },
          ['usuario', 'senha', 'papel'],
        ),
      },
    },
    controller.criarUsuario,
  );

  app.get('/parametros', { ...protegida(PERMISSOES.GERENCIAR_PARAMETROS) }, controller.listarParametros);

  app.patch<RotaAtualizarParametro>(
    '/parametros/:chave',
    {
      ...protegida(PERMISSOES.GERENCIAR_PARAMETROS),
      schema: {
        params: { type: 'object', required: ['chave'], properties: { chave: texto(1, 60) } },
        body: corpo({ valorNumerico: { type: 'number' } }, ['valorNumerico']),
      },
    },
    controller.atualizarParametro,
  );
}
