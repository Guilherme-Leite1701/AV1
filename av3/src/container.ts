import { PrismaClient } from '@prisma/client';
import { AuthController } from './controllers/AuthController';
import { EquipamentoController } from './controllers/EquipamentoController';
import { LoteController } from './controllers/LoteController';
import { OrganizacaoController } from './controllers/OrganizacaoController';
import { RelatorioController } from './controllers/RelatorioController';
import { AdminController } from './controllers/AdminController';
import { AnaliseController } from './controllers/AnaliseController';
import { PublicoController } from './controllers/PublicoController';
import { FilaTarefas } from './filas/FilaTarefas';
import { criarProcessadores } from './filas/processadores';
import { criarAutenticacaoChaveApi } from './middlewares/autenticarChaveApi';
import { AnaliseRepository } from './repositories/AnaliseRepository';
import { ChaveApiRepository } from './repositories/ChaveApiRepository';
import { TarefaRelatorioRepository } from './repositories/TarefaRelatorioRepository';
import { VERSAO_API_PUBLICA } from './routes/publico.routes';
import { ServicoAnalise } from './services/ServicoAnalise';
import { ServicoApiPublica } from './services/ServicoApiPublica';
import { ServicoChaveApi } from './services/ServicoChaveApi';
import { EnviarWebhook, ServicoRelatorioAssincrono, enviarWebhookPorFetch } from './services/ServicoRelatorioAssincrono';
import { ContadorRepository } from './repositories/ContadorRepository';
import { CredencialRepository } from './repositories/CredencialRepository';
import { EquipamentoRepository } from './repositories/EquipamentoRepository';
import { GerenciadorTransacao } from './repositories/infra';
import { JournalRepository } from './repositories/JournalRepository';
import { LoteRepository } from './repositories/LoteRepository';
import { MovimentacaoRepository } from './repositories/MovimentacaoRepository';
import { OrganizacaoRepository } from './repositories/OrganizacaoRepository';
import { ParametroRepository } from './repositories/ParametroRepository';
import { AssinadorToken, ServicoAutenticacao } from './services/ServicoAutenticacao';
import { ServicoEquipamento } from './services/ServicoEquipamento';
import { ServicoLote } from './services/ServicoLote';
import { ServicoOrganizacao } from './services/ServicoOrganizacao';
import { ServicoParametros } from './services/ServicoParametros';
import { ServicoRelatorio } from './services/ServicoRelatorio';

export interface OpcoesContainer {
  permitirWebhookHttp?: boolean;
  enviarWebhook?: EnviarWebhook;
}

/** Composition root: liga as camadas por injeção de dependência (a fila entra como porta). */
export function criarContainer(prisma: PrismaClient, assinarToken: AssinadorToken, fila: FilaTarefas, opcoes: OpcoesContainer = {}) {
  // Repositórios
  const transacao = new GerenciadorTransacao(prisma);
  const journal = new JournalRepository(prisma);
  const credenciais = new CredencialRepository(prisma);
  const parametrosRepo = new ParametroRepository(prisma);
  const contadores = new ContadorRepository(prisma);
  const organizacoes = new OrganizacaoRepository(prisma);
  const lotes = new LoteRepository(prisma);
  const equipamentos = new EquipamentoRepository(prisma);
  const movimentacoes = new MovimentacaoRepository(prisma);
  const analisesRepo = new AnaliseRepository(prisma);
  const chavesRepo = new ChaveApiRepository(prisma);
  const tarefasRepo = new TarefaRelatorioRepository(prisma);

  // Serviços
  const servicoParametros = new ServicoParametros(parametrosRepo, journal, transacao);
  const servicoAutenticacao = new ServicoAutenticacao(credenciais, journal, transacao, assinarToken);
  const servicoOrganizacao = new ServicoOrganizacao(organizacoes, journal, transacao);
  const servicoLote = new ServicoLote(lotes, organizacoes, equipamentos, movimentacoes, contadores, journal, transacao, servicoParametros);
  const servicoEquipamento = new ServicoEquipamento(equipamentos, lotes, organizacoes, movimentacoes, journal, transacao, servicoParametros);
  const servicoRelatorio = new ServicoRelatorio(lotes, equipamentos, organizacoes, journal, servicoParametros);
  // AV3
  const servicoAnalise = new ServicoAnalise(analisesRepo, servicoParametros, transacao);
  const servicoChaveApi = new ServicoChaveApi(chavesRepo, organizacoes, journal, transacao);
  const servicoRelatorioAssincrono = new ServicoRelatorioAssincrono(tarefasRepo, chavesRepo, analisesRepo, servicoAnalise, journal, fila, {
    permitirWebhookHttp: opcoes.permitirWebhookHttp ?? false,
    enviarWebhook: opcoes.enviarWebhook ?? enviarWebhookPorFetch,
  });
  const servicoApiPublica = new ServicoApiPublica(servicoLote, servicoEquipamento, servicoAnalise);

  // Controllers
  return {
    authController: new AuthController(servicoAutenticacao, servicoParametros),
    organizacaoController: new OrganizacaoController(servicoOrganizacao),
    loteController: new LoteController(servicoLote),
    equipamentoController: new EquipamentoController(servicoEquipamento),
    relatorioController: new RelatorioController(servicoRelatorio),
    // AV3
    analiseController: new AnaliseController(servicoAnalise),
    adminController: new AdminController(servicoChaveApi, servicoAnalise, servicoRelatorioAssincrono),
    publicoController: new PublicoController(servicoApiPublica, servicoRelatorioAssincrono, VERSAO_API_PUBLICA),
    autenticarChaveApi: criarAutenticacaoChaveApi(servicoChaveApi),
    processadores: criarProcessadores({ relatorios: servicoRelatorioAssincrono, analises: servicoAnalise }),
    servicos: { analise: servicoAnalise, chaveApi: servicoChaveApi, relatorioAssincrono: servicoRelatorioAssincrono },
  };
}
