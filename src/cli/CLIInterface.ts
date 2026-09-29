import { Sessao } from '../autenticacao/Sessao';
import { Usuario } from '../autenticacao/Usuario';
import { EstadoFisico } from '../enums/EstadoFisico';
import { PapelUsuario } from '../enums/PapelUsuario';
import { StatusRastreamento } from '../enums/StatusRastreamento';
import { TipoEquipamento } from '../enums/TipoEquipamento';
import { FabricaObjetos } from '../fabricas/FabricaObjetos';
import { JournalTransacao } from '../persistencia/JournalTransacao';
import { ServicoAutenticacao } from '../servicos/ServicoAutenticacao';
import { ServicoEquipamento } from '../servicos/ServicoEquipamento';
import { ServicoLote } from '../servicos/ServicoLote';
import { ServicoOrganizacao } from '../servicos/ServicoOrganizacao';
import { ServicoParametros } from '../servicos/ServicoParametros';
import { ServicoRelatorio } from '../servicos/ServicoRelatorio';
import { Saida } from './Saida';
import { Terminal } from './Terminal';

/** Comando digitado, já separado: `<entidade> <acao> [posicionais] [--opcao valor]`. */
interface Argumentos {
  posicionais: string[];
  opcoes: Record<string, string | true>;
}

interface Comando {
  uso: string;
  descricao: string;
  executar: (args: Argumentos) => void | Promise<void>;
}

/** Interface de linha de comando (FR09). */
export class CLIInterface {
  private static readonly COMANDOS_GERAIS = ['menu', 'ajuda', 'senha alterar', 'logout', 'sair'];

  private terminal: Terminal;
  private autenticacao: ServicoAutenticacao;
  private organizacao: ServicoOrganizacao;
  private lote: ServicoLote;
  private equipamento: ServicoEquipamento;
  private relatorio: ServicoRelatorio;
  private parametros: ServicoParametros;
  private sessaoAtual: Sessao | null = null;
  private usuarioAtual: Usuario | null = null;

  private readonly comandos: Record<string, Comando>;

  constructor(
    terminal: Terminal,
    autenticacao: ServicoAutenticacao,
    organizacao: ServicoOrganizacao,
    lote: ServicoLote,
    equipamento: ServicoEquipamento,
    relatorio: ServicoRelatorio,
    parametros: ServicoParametros,
  ) {
    this.terminal = terminal;
    this.autenticacao = autenticacao;
    this.organizacao = organizacao;
    this.lote = lote;
    this.equipamento = equipamento;
    this.relatorio = relatorio;
    this.parametros = parametros;
    this.comandos = this.criarComandos();
    this.terminal.definirCompletar(() => this.sugestoes());
  }

  public async iniciarLoop(): Promise<void> {
    Saida.info('greencode — digite "login <usuario>", "ajuda" ou "sair". Use Tab para completar comandos.');
    while (true) {
      const linha = await this.terminal.lerComando('greencode> ');
      if (linha === null || linha.trim() === 'sair') break;
      await this.processarComando(linha);
    }
    if (this.sessaoAtual) this.autenticacao.logout(this.sessaoAtual.getToken());
    this.terminal.fechar();
    Saida.info('Até logo.');
  }

  public async processarComando(entrada: string): Promise<void> {
    const tokens = CLIInterface.separar(entrada);
    if (tokens.length === 0) return;
    const [entidade, acao = ''] = tokens;

    try {
      if (entidade === 'ajuda' || entidade === 'menu') {
        if (this.usuarioAtual) this.exibirMenuPorPapel(this.usuarioAtual.getPapel());
        else Saida.info('Comandos: login <usuario>, sair');
        return;
      }

      if (entidade === 'login') {
        await this.login(acao);
        return;
      }

      if (!this.sessaoAtual || !this.usuarioAtual) {
        Saida.aviso('Faça login primeiro: login <usuario>');
        return;
      }

      // Sessão expirada por inatividade (NFR02)?
      if (!this.autenticacao.validarToken(this.sessaoAtual.getToken())) {
        this.sessaoAtual = null;
        this.usuarioAtual = null;
        Saida.aviso('Sessão expirada por 30 minutos de inatividade. Faça login novamente.');
        return;
      }
      this.usuarioAtual.renovarToken();

      if (entidade === 'logout') {
        this.autenticacao.logout(this.sessaoAtual.getToken());
        this.sessaoAtual = null;
        this.usuarioAtual = null;
        Saida.sucesso('Sessão encerrada.');
        return;
      }

      if (entidade === 'senha' && acao === 'alterar') {
        await this.alterarSenha();
        return;
      }

      const chave = `${entidade} ${acao}`;
      const comando = this.comandos[chave];
      if (!comando) {
        Saida.erro(`Comando desconhecido: "${chave.trim()}". Digite "menu".`);
        return;
      }
      if (!this.usuarioAtual.podeExecutar(chave)) {
        Saida.erro('Acesso negado para o seu perfil.');
        return;
      }
      await comando.executar(CLIInterface.interpretar(tokens.slice(2)));
    } catch (erro) {
      Saida.erro(erro instanceof Error ? erro.message : String(erro));
    }
  }

  /** O menu mostra só o que o papel pode executar. */
  public exibirMenuPorPapel(papel: PapelUsuario): void {
    console.log(`\nComandos disponíveis (${papel}):`);
    for (const [chave, comando] of Object.entries(this.comandos)) {
      if (this.usuarioAtual?.podeExecutar(chave)) {
        console.log(`  ${comando.uso.padEnd(62)} ${comando.descricao}`);
      }
    }
    console.log(`  ${'senha alterar'.padEnd(62)} Altera a sua senha`);
    console.log(`  ${'menu'.padEnd(62)} Mostra este menu`);
    console.log(`  ${'logout'.padEnd(62)} Encerra a sessão`);
    console.log(`  ${'sair'.padEnd(62)} Fecha o programa\n`);
  }

  // ---------------------------------------------------------------- sessão

  private async login(usuario: string): Promise<void> {
    if (this.sessaoAtual) {
      Saida.aviso('Já existe um usuário logado. Use "logout" antes.');
      return;
    }
    if (!usuario) throw new Error('Uso: login <usuario>');
    const senha = (await this.terminal.lerSenha('Senha: ')) ?? '';
    this.sessaoAtual = this.autenticacao.login(usuario, senha);
    this.usuarioAtual = this.autenticacao.obterUsuario(this.sessaoAtual.getToken());
    Saida.sucesso(`Bem-vindo, ${usuario} (${this.sessaoAtual.getPapel()}).`);
    this.exibirMenuPorPapel(this.sessaoAtual.getPapel());
  }

  private async alterarSenha(): Promise<void> {
    const usuario = this.usuarioAtual as Usuario;
    const atual = (await this.terminal.lerSenha('Senha atual: ')) ?? '';
    const nova = await this.lerSenhaConfirmada('Nova senha');
    if (!this.autenticacao.alterarSenha(usuario.getNome(), atual, nova)) {
      throw new Error('Senha atual incorreta.');
    }
    Saida.sucesso('Senha alterada.');
  }

  private async lerSenhaConfirmada(rotulo: string): Promise<string> {
    const senha = (await this.terminal.lerSenha(`${rotulo}: `)) ?? '';
    const confirmacao = (await this.terminal.lerSenha('Confirme: ')) ?? '';
    if (senha !== confirmacao) throw new Error('As senhas não conferem.');
    return senha;
  }

  private sugestoes(): string[] {
    if (!this.usuarioAtual) return ['login ', 'ajuda', 'sair'];
    const usuario = this.usuarioAtual;
    const permitidos = Object.keys(this.comandos).filter((c) => usuario.podeExecutar(c));
    return [...permitidos, ...CLIInterface.COMANDOS_GERAIS];
  }

  // ---------------------------------------------------------------- comandos

  private criarComandos(): Record<string, Comando> {
    const responsavel = () => this.usuarioAtual?.getNome() ?? 'sistema';

    return {
      // ---- Administrador
      'usuario criar': {
        uso: 'usuario criar --nome <usuario> --papel <PAPEL>',
        descricao: 'Cria uma conta de acesso',
        executar: async ({ opcoes }) => {
          const nome = CLIInterface.obrigatorio(opcoes, 'nome');
          const papel = CLIInterface.lerEnum(CLIInterface.obrigatorio(opcoes, 'papel'), PapelUsuario, 'papel');
          const senha = await this.lerSenhaConfirmada(`Senha de ${nome}`);
          this.autenticacao.criarUsuario(nome, senha, papel);
          Saida.sucesso(`Usuário ${nome} (${papel}) criado.`);
        },
      },
      'usuario listar': {
        uso: 'usuario listar',
        descricao: 'Lista as contas de acesso',
        executar: () => {
          for (const u of this.autenticacao.listarUsuarios()) console.log(`- ${u.usuario} | ${u.papel}`);
        },
      },
      'param listar': {
        uso: 'param listar',
        descricao: 'Mostra os parâmetros globais',
        executar: () => {
          const p = this.parametros.obter();
          console.log(`- Alíquota de imposto: ${(p.aliquotaImposto * 100).toFixed(2)}%`);
          console.log(`- Coeficiente de depreciação anual: ${(p.coeficienteDepreciacao * 100).toFixed(2)}%`);
        },
      },
      'param definir': {
        uso: 'param definir [--aliquota 0.18] [--depreciacao 0.2]',
        descricao: 'Altera os parâmetros globais',
        executar: ({ opcoes }) => {
          const aliquota = CLIInterface.opcional(opcoes, 'aliquota');
          const depreciacao = CLIInterface.opcional(opcoes, 'depreciacao');
          if (aliquota === undefined && depreciacao === undefined) throw new Error('Informe --aliquota e/ou --depreciacao.');
          this.parametros.definir({
            aliquotaImposto: aliquota === undefined ? undefined : Number(aliquota),
            coeficienteDepreciacao: depreciacao === undefined ? undefined : Number(depreciacao),
          });
          Saida.sucesso('Parâmetros atualizados.');
        },
      },

      // ---- Operador de cadastro
      'org cadastrar': {
        uso: 'org cadastrar --cnpj --razao --endereco --assinatura --vencimento --valor',
        descricao: 'Cadastra organização e contrato (opcionais: --ie --tel --email --clausulas "a;b" --renovacao-auto)',
        executar: ({ opcoes }) => {
          const org = this.organizacao.cadastrarOrganizacao({
            cnpj: CLIInterface.obrigatorio(opcoes, 'cnpj'),
            razaoSocial: CLIInterface.obrigatorio(opcoes, 'razao'),
            enderecoCompleto: CLIInterface.obrigatorio(opcoes, 'endereco'),
            inscricaoEstadual: CLIInterface.opcional(opcoes, 'ie'),
            telefone: CLIInterface.opcional(opcoes, 'tel'),
            email: CLIInterface.opcional(opcoes, 'email'),
            contrato: {
              dataAssinatura: CLIInterface.lerData(CLIInterface.obrigatorio(opcoes, 'assinatura')),
              dataVencimento: CLIInterface.lerData(CLIInterface.obrigatorio(opcoes, 'vencimento')),
              valorMensal: Number(CLIInterface.obrigatorio(opcoes, 'valor')),
              clausulas: (CLIInterface.opcional(opcoes, 'clausulas') ?? '').split(';').map((c) => c.trim()).filter(Boolean),
              renovacaoAutomatica: opcoes['renovacao-auto'] === true,
            },
          });
          Saida.sucesso(`Organização ${org.getRazaoSocial()} cadastrada (id/CNPJ ${org.getId()}).`);
        },
      },
      'org listar': {
        uso: 'org listar',
        descricao: 'Lista as organizações ativas',
        executar: () => {
          const lista = this.organizacao.listarOrganizacoesAtivas();
          if (lista.length === 0) return Saida.info('Nenhuma organização ativa.');
          for (const o of lista) {
            const situacao = o.getContratoVigente().estaVigente() ? 'vigente' : 'vencido';
            console.log(`- ${o.getId()} | ${o.getRazaoSocial()} | contrato ${situacao}`);
          }
        },
      },
      'org buscar': {
        uso: 'org buscar <cnpj>',
        descricao: 'Mostra os dados de uma organização',
        executar: ({ posicionais }) => {
          const o = this.organizacao.buscarOrganizacao(CLIInterface.posicional(posicionais, 0, 'cnpj'));
          const c = o.getContratoVigente();
          console.log(`${o.getRazaoSocial()} | CNPJ ${o.getCnpj()} | ${o.isAtivo() ? 'ativa' : 'desativada'}`);
          console.log(`Endereço: ${o.getEnderecoCompleto()} | Tel: ${o.getTelefone()} | E-mail: ${o.getEmail()}`);
          console.log(
            `Contrato: ${CLIInterface.data(c.getDataAssinatura())} a ${CLIInterface.data(c.getDataVencimento())} | ` +
              `R$ ${c.getValorMensal().toFixed(2)}/mês | ${c.estaVigente() ? 'vigente' : 'vencido'}`,
          );
        },
      },
      'org endereco': {
        uso: 'org endereco <cnpj> --endereco "<novo endereço>"',
        descricao: 'Altera o endereço',
        executar: ({ posicionais, opcoes }) => {
          this.organizacao.alterarEndereco(CLIInterface.posicional(posicionais, 0, 'cnpj'), CLIInterface.obrigatorio(opcoes, 'endereco'));
          Saida.sucesso('Endereço alterado.');
        },
      },
      'org desativar': {
        uso: 'org desativar <cnpj>',
        descricao: 'Desativa uma organização',
        executar: ({ posicionais }) => {
          this.organizacao.desativarOrganizacao(CLIInterface.posicional(posicionais, 0, 'cnpj'));
          Saida.sucesso('Organização desativada.');
        },
      },
      'contrato renovar': {
        uso: 'contrato renovar <cnpj> --vencimento <aaaa-mm-dd>',
        descricao: 'Renova o contrato vigente',
        executar: ({ posicionais, opcoes }) => {
          this.organizacao.renovarContrato(
            CLIInterface.posicional(posicionais, 0, 'cnpj'),
            CLIInterface.lerData(CLIInterface.obrigatorio(opcoes, 'vencimento')),
          );
          Saida.sucesso('Contrato renovado.');
        },
      },

      // ---- Gestor de almoxarifado
      'lote criar': {
        uso: 'lote criar --org <cnpj> --nf <nota> --transp <transportadora>',
        descricao: 'Registra a entrada de um lote (opcionais: --data aaaa-mm-dd --obs "...")',
        executar: ({ opcoes }) => {
          const data = CLIInterface.opcional(opcoes, 'data');
          const lote = this.lote.criarLote({
            organizacaoId: CLIInterface.obrigatorio(opcoes, 'org').replace(/[.\/\-\s]/g, '').toUpperCase(),
            notaFiscal: CLIInterface.obrigatorio(opcoes, 'nf'),
            transportadora: CLIInterface.obrigatorio(opcoes, 'transp'),
            dataEntrada: data ? CLIInterface.lerData(data) : undefined,
            observacoes: CLIInterface.opcional(opcoes, 'obs'),
          });
          Saida.sucesso(`Lote ${lote.getId()} registrado.`);
        },
      },
      'lote listar': {
        uso: 'lote listar [--de aaaa-mm-dd] [--ate aaaa-mm-dd]',
        descricao: 'Lista os lotes do período',
        executar: ({ opcoes }) => {
          const de = CLIInterface.opcional(opcoes, 'de');
          const ate = CLIInterface.opcional(opcoes, 'ate');
          const lotes = this.lote.consultarLotePorPeriodo(
            de ? CLIInterface.lerData(de) : new Date(0),
            ate ? CLIInterface.lerData(ate, true) : new Date(),
          );
          if (lotes.length === 0) return Saida.info('Nenhum lote no período.');
          for (const l of lotes) {
            console.log(
              `- ${l.getId()} | ${CLIInterface.data(l.getDataEntrada())} | org ${l.getOrganizacaoId()} | ` +
                `NF ${l.getNotaFiscal()} | ${l.getEquipamentos().length} equip. | ${l.getStatusProcessamento()}`,
            );
          }
        },
      },
      'lote triagem': {
        uso: 'lote triagem <loteId>',
        descricao: 'Inicia a triagem do lote',
        executar: ({ posicionais }) => {
          this.lote.processarTriagem(CLIInterface.posicional(posicionais, 0, 'loteId'), responsavel());
          Saida.sucesso('Triagem iniciada.');
        },
      },
      'lote concluir': {
        uso: 'lote concluir <loteId>',
        descricao: 'Conclui a triagem do lote',
        executar: ({ posicionais }) => {
          this.lote.concluirTriagem(CLIInterface.posicional(posicionais, 0, 'loteId'));
          Saida.sucesso('Triagem concluída.');
        },
      },
      'lote relatorio': {
        uso: 'lote relatorio <loteId>',
        descricao: 'Relatório de triagem do lote',
        executar: ({ posicionais }) => {
          console.log(this.lote.buscarLote(CLIInterface.posicional(posicionais, 0, 'loteId')).gerarRelatorioTriagem());
        },
      },
      'equip adicionar': {
        uso: 'equip adicionar --lote --tipo --marca --modelo --ano --estado --peso',
        descricao: 'Registra um equipamento e aloca seu código de barras',
        executar: ({ opcoes }) => {
          const loteId = CLIInterface.obrigatorio(opcoes, 'lote');
          const tipo = CLIInterface.lerEnum(CLIInterface.obrigatorio(opcoes, 'tipo'), TipoEquipamento, 'tipo');
          const lote = this.lote.buscarLote(loteId);
          const sequencia = this.equipamento.proximaSequencia();
          const equip = FabricaObjetos.criarEquipamento(
            `EQP-${String(sequencia).padStart(6, '0')}`,
            this.equipamento.gerarCodigoBarras(tipo, sequencia),
            {
              tipo,
              marca: CLIInterface.obrigatorio(opcoes, 'marca'),
              modelo: CLIInterface.obrigatorio(opcoes, 'modelo'),
              anoFabricacao: Number(CLIInterface.obrigatorio(opcoes, 'ano')),
              estadoFisico: CLIInterface.lerEnum(CLIInterface.obrigatorio(opcoes, 'estado'), EstadoFisico, 'estado'),
              pesoQuilogramas: Number(CLIInterface.obrigatorio(opcoes, 'peso')),
            },
            loteId,
            lote.getEquipamentos().length + 1,
            responsavel(),
          );
          this.lote.adicionarEquipamentoLote(loteId, equip);
          Saida.sucesso(`Equipamento ${equip.getId()} registrado — código de barras ${equip.getCodigoBarrasInterno()}.`);
        },
      },
      'equip status': {
        uso: 'equip status <id> --status <STATUS> [--just "..."]',
        descricao: 'Altera o status de rastreamento',
        executar: ({ posicionais, opcoes }) => {
          this.equipamento.atualizarStatus(
            CLIInterface.posicional(posicionais, 0, 'id'),
            CLIInterface.lerEnum(CLIInterface.obrigatorio(opcoes, 'status'), StatusRastreamento, 'status'),
            CLIInterface.opcional(opcoes, 'just') ?? '',
            responsavel(),
          );
          Saida.sucesso('Status atualizado.');
        },
      },
      'equip estado': {
        uso: 'equip estado <id> --estado <ESTADO> [--just "..."]',
        descricao: 'Altera o estado físico (queda de 2+ categorias exige --just)',
        executar: ({ posicionais, opcoes }) => {
          this.equipamento.atualizarEstadoFisico(
            CLIInterface.posicional(posicionais, 0, 'id'),
            CLIInterface.lerEnum(CLIInterface.obrigatorio(opcoes, 'estado'), EstadoFisico, 'estado'),
            CLIInterface.opcional(opcoes, 'just'),
            responsavel(),
          );
          Saida.sucesso('Estado físico atualizado.');
        },
      },
      'equip mover': {
        uso: 'equip mover <id> --destino "<local>"',
        descricao: 'Registra uma movimentação física',
        executar: ({ posicionais, opcoes }) => {
          this.equipamento.registrarMovimentacao(
            CLIInterface.posicional(posicionais, 0, 'id'),
            CLIInterface.obrigatorio(opcoes, 'destino'),
            responsavel(),
          );
          Saida.sucesso('Movimentação registrada.');
        },
      },
      'equip rastrear': {
        uso: 'equip rastrear <id ou código de barras>',
        descricao: 'Histórico completo do equipamento',
        executar: ({ posicionais }) => {
          const h = this.equipamento.rastrearEquipamento(CLIInterface.posicional(posicionais, 0, 'id'));
          console.log(`${h.equipamentoId} | ${h.codigoBarrasInterno} | lote ${h.loteId} | ${h.estadoFisicoAtual} | ${h.statusAtual}`);
          for (const m of h.movimentacoes) {
            console.log(
              `  ${m.getDataHora().toLocaleString('pt-BR')} | ${m.getOrigem()} → ${m.getDestino()} | ` +
                `${m.getResponsavel()}${m.getObservacao() ? ' | ' + m.getObservacao() : ''}`,
            );
          }
        },
      },

      // ---- Auditor
      'rel organizacao': {
        uso: 'rel organizacao <cnpj> --de aaaa-mm-dd --ate aaaa-mm-dd',
        descricao: 'Relatório de lotes de uma organização',
        executar: ({ posicionais, opcoes }) => {
          console.log(
            this.relatorio.gerarRelatorioPorOrganizacao(CLIInterface.posicional(posicionais, 0, 'cnpj'), {
              inicio: CLIInterface.lerData(CLIInterface.obrigatorio(opcoes, 'de')),
              fim: CLIInterface.lerData(CLIInterface.obrigatorio(opcoes, 'ate'), true),
            }),
          );
        },
      },
      'rel status': {
        uso: 'rel status <STATUS>',
        descricao: 'Equipamentos por status de rastreamento',
        executar: ({ posicionais }) => {
          const status = CLIInterface.lerEnum(CLIInterface.posicional(posicionais, 0, 'STATUS'), StatusRastreamento, 'status');
          console.log(this.relatorio.gerarRelatorioPorStatus(status));
        },
      },
      'rel financeiro': {
        uso: 'rel financeiro --de aaaa-mm-dd --ate aaaa-mm-dd',
        descricao: 'Resumo de depreciação do período',
        executar: ({ opcoes }) => {
          console.log(
            this.relatorio.gerarRelatorioFinanceiro({
              inicio: CLIInterface.lerData(CLIInterface.obrigatorio(opcoes, 'de')),
              fim: CLIInterface.lerData(CLIInterface.obrigatorio(opcoes, 'ate'), true),
            }),
          );
        },
      },
      'log listar': {
        uso: 'log listar [--ultimos 20]',
        descricao: 'Últimas transações do journal',
        executar: ({ opcoes }) => {
          const quantidade = Number(CLIInterface.opcional(opcoes, 'ultimos') ?? 20);
          for (const t of JournalTransacao.lerUltimas(quantidade)) {
            console.log(`- ${new Date(t.timestamp).toLocaleString('pt-BR')} | ${t.usuarioResponsavel} | ${t.operacao} | ${t.entidade} | ${t.dadosDepois?.id ?? t.dadosAntes?.id ?? ''}`);
          }
        },
      },
    };
  }

  // ---------------------------------------------------------------- utilitários

  /** Separa por espaços, respeitando textos entre aspas: --obs "caixa aberta". */
  private static separar(entrada: string): string[] {
    return [...entrada.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
  }

  private static interpretar(tokens: string[]): Argumentos {
    const posicionais: string[] = [];
    const opcoes: Record<string, string | true> = {};
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.startsWith('--')) {
        posicionais.push(token);
        continue;
      }
      const proximo = tokens[i + 1];
      if (proximo !== undefined && !proximo.startsWith('--')) {
        opcoes[token.slice(2)] = proximo;
        i++;
      } else {
        opcoes[token.slice(2)] = true; // opção sem valor, ex.: --renovacao-auto
      }
    }
    return { posicionais, opcoes };
  }

  private static obrigatorio(opcoes: Record<string, string | true>, nome: string): string {
    const valor = opcoes[nome];
    if (typeof valor !== 'string' || valor === '') throw new Error(`Informe --${nome}.`);
    return valor;
  }

  private static opcional(opcoes: Record<string, string | true>, nome: string): string | undefined {
    const valor = opcoes[nome];
    return typeof valor === 'string' ? valor : undefined;
  }

  private static posicional(posicionais: string[], indice: number, nome: string): string {
    if (!posicionais[indice]) throw new Error(`Informe <${nome}>.`);
    return posicionais[indice];
  }

  private static lerEnum<T extends Record<string, string>>(valor: string, tipo: T, nome: string): T[keyof T] {
    const maiusculo = valor.toUpperCase();
    if (!Object.values(tipo).includes(maiusculo)) {
      throw new Error(`Valor inválido para ${nome}. Opções: ${Object.values(tipo).join(', ')}`);
    }
    return maiusculo as T[keyof T];
  }

  /** Lê "aaaa-mm-dd" no fuso local (new Date("aaaa-mm-dd") usaria UTC e voltaria um dia no Brasil). */
  private static lerData(texto: string, fimDoDia: boolean = false): Date {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    if (!partes) throw new Error(`Data inválida: "${texto}". Use aaaa-mm-dd.`);
    const [, ano, mes, dia] = partes.map(Number);
    return fimDoDia ? new Date(ano, mes - 1, dia, 23, 59, 59, 999) : new Date(ano, mes - 1, dia);
  }

  private static data(data: Date): string {
    return data.toLocaleDateString('pt-BR');
  }
}
