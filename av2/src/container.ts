import { PrismaClient } from '@prisma/client';
import { AuthController } from './controllers/AuthController';
import { EquipamentoController } from './controllers/EquipamentoController';
import { LoteController } from './controllers/LoteController';
import { OrganizacaoController } from './controllers/OrganizacaoController';
import { RelatorioController } from './controllers/RelatorioController';
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

/** Composition root: liga as camadas por injeção de dependência. */
export function criarContainer(prisma: PrismaClient, assinarToken: AssinadorToken) {
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

  // Serviços
  const servicoParametros = new ServicoParametros(parametrosRepo, journal, transacao);
  const servicoAutenticacao = new ServicoAutenticacao(credenciais, journal, transacao, assinarToken);
  const servicoOrganizacao = new ServicoOrganizacao(organizacoes, journal, transacao);
  const servicoLote = new ServicoLote(lotes, organizacoes, equipamentos, movimentacoes, contadores, journal, transacao, servicoParametros);
  const servicoEquipamento = new ServicoEquipamento(equipamentos, lotes, organizacoes, movimentacoes, journal, transacao, servicoParametros);
  const servicoRelatorio = new ServicoRelatorio(lotes, equipamentos, organizacoes, journal, servicoParametros);

  // Controllers
  return {
    authController: new AuthController(servicoAutenticacao, servicoParametros),
    organizacaoController: new OrganizacaoController(servicoOrganizacao),
    loteController: new LoteController(servicoLote),
    equipamentoController: new EquipamentoController(servicoEquipamento),
    relatorioController: new RelatorioController(servicoRelatorio),
  };
}
