import { TarefaRelatorio } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { AnalisadorRentabilidade } from '../domain/analise/AnalisadorRentabilidade';
import { AnalisadorVidaUtil } from '../domain/analise/AnalisadorVidaUtil';
import { ChaveApi } from '../domain/entidades/ChaveApi';
import { FormatoRelatorio, StatusTarefa, TipoRelatorioAssincrono } from '../domain/enums/TarefaRelatorio';
import {
  ErroConflito,
  ErroNaoEncontrado,
  ErroRecursoExpirado,
  ErroServicoIndisponivel,
  ErroTarefaIrrecuperavel,
  ErroValidacao,
} from '../domain/erros/ErrosAplicacao';
import { LinhaRelatorio, SerializadorRelatorio } from '../domain/relatorios/SerializadorRelatorio';
import { ContextoTentativa, DadosTarefas, FilaTarefas } from '../filas/FilaTarefas';
import { AnaliseRepository } from '../repositories/AnaliseRepository';
import { ChaveApiRepository } from '../repositories/ChaveApiRepository';
import { JournalRepository } from '../repositories/JournalRepository';
import { ResumoTarefa, TarefaRelatorioRepository } from '../repositories/TarefaRelatorioRepository';
import { ServicoAnalise } from './ServicoAnalise';
import { Relogio, UsuarioAutenticado, relogioDoSistema } from './tipos';

/** Envio HTTP do webhook (injetável: nos testes não sai rede nenhuma). */
export type EnviarWebhook = (url: string, corpo: string, cabecalhos: Record<string, string>) => Promise<{ ok: boolean; status: number }>;

export const enviarWebhookPorFetch: EnviarWebhook = async (url, corpo, cabecalhos) => {
  const resposta = await fetch(url, {
    method: 'POST',
    body: corpo,
    headers: cabecalhos,
    signal: AbortSignal.timeout(5_000),
    redirect: 'error',
  });
  return { ok: resposta.ok, status: resposta.status };
};

export interface PedidoRelatorio {
  tipo: TipoRelatorioAssincrono;
  formato: FormatoRelatorio;
  organizacaoId?: string;
  webhookUrl?: string;
}

export const PREFIXO_RELATORIOS_PUBLICOS = '/api/v1/public/relatorios';

/**
 * Relatórios pesados pedidos pela API pública. A requisição só cria a tarefa e publica
 * o id na fila (202 Accepted); o worker gera o arquivo; o parceiro acompanha por polling
 * (GET status) ou recebe um webhook assinado com HMAC-SHA256.
 */
export class ServicoRelatorioAssincrono {
  public static readonly RETENCAO_HORAS = 24;

  constructor(
    private readonly tarefas: TarefaRelatorioRepository,
    private readonly chaves: ChaveApiRepository,
    private readonly analises: AnaliseRepository,
    private readonly servicoAnalise: ServicoAnalise,
    private readonly journal: JournalRepository,
    private readonly fila: FilaTarefas,
    private readonly opcoes: { permitirWebhookHttp: boolean; enviarWebhook: EnviarWebhook } = {
      permitirWebhookHttp: false,
      enviarWebhook: enviarWebhookPorFetch,
    },
    private readonly relogio: Relogio = relogioDoSistema,
  ) {}

  /** Cria a tarefa e a publica na fila; responde na hora com o id para acompanhamento. */
  public async solicitar(pedido: PedidoRelatorio, parceiro: ChaveApi) {
    const organizacaoId = parceiro.resolverOrganizacao(pedido.organizacaoId) ?? null;
    const webhookUrl = pedido.webhookUrl
      ? ServicoRelatorioAssincrono.validarUrlWebhook(pedido.webhookUrl, this.opcoes.permitirWebhookHttp)
      : null;

    const tarefa = await this.tarefas.criar({
      tipo: pedido.tipo,
      formato: pedido.formato,
      chaveApiId: parceiro.id,
      solicitante: parceiro.identificacao,
      organizacaoId,
      webhookUrl,
    });
    try {
      await this.fila.enfileirar('gerar-relatorio', { tarefaId: tarefa.id }, { idJob: tarefa.id });
    } catch (erro) {
      await this.tarefas.registrarFalha(tarefa.id, `Fila indisponível: ${(erro as Error).message}`, true, this.relogio());
      throw new ErroServicoIndisponivel('A fila de processamento está indisponível. Tente novamente em instantes.');
    }
    return ServicoRelatorioAssincrono.paraStatus(tarefa);
  }

  /** Status para polling; uma chave só enxerga as próprias tarefas (senão, 404). */
  public async consultar(id: string, parceiro: ChaveApi) {
    return ServicoRelatorioAssincrono.paraStatus(await this.obterDoParceiro(id, parceiro));
  }

  /** Conteúdo do arquivo: 409 se ainda não terminou, 410 se o prazo de download acabou. */
  public async baixar(id: string, parceiro: ChaveApi) {
    const resumo = await this.obterDoParceiro(id, parceiro);
    if (resumo.status !== StatusTarefa.CONCLUIDA) {
      throw new ErroConflito(`O relatório ainda não está pronto (status ${resumo.status}).`, { status: resumo.status });
    }
    if (resumo.expiraEm && resumo.expiraEm.getTime() <= this.relogio().getTime()) {
      throw new ErroRecursoExpirado('O prazo de download deste relatório acabou. Solicite um novo.');
    }
    const completa = (await this.tarefas.buscarCompleta(id)) as TarefaRelatorio;
    return {
      conteudo: completa.conteudo ?? '',
      nomeArquivo: completa.nomeArquivo ?? `${id}.txt`,
      tipoConteudo: completa.formato === FormatoRelatorio.CSV ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    };
  }

  /**
   * Processador do job "gerar-relatorio" (roda no worker). Idempotente: se a tarefa já
   * foi concluída, não refaz. Em erro, registra a tentativa e relança para a fila decidir o retry.
   */
  public async processar(dados: DadosTarefas['gerar-relatorio'], contexto: ContextoTentativa): Promise<void> {
    const tarefa = await this.tarefas.buscarResumo(dados.tarefaId);
    if (!tarefa) throw new ErroTarefaIrrecuperavel(`Tarefa ${dados.tarefaId} não existe mais.`);
    if (tarefa.status === StatusTarefa.CONCLUIDA) return;
    if (!(await this.tarefas.marcarProcessando(tarefa.id, contexto.tentativa, this.relogio()))) return;

    try {
      const linhas = await this.gerarLinhas(tarefa.tipo as TipoRelatorioAssincrono, tarefa.organizacaoId ?? undefined);
      const agora = this.relogio();
      const arquivo = SerializadorRelatorio.serializar(linhas, {
        tipo: tarefa.tipo as TipoRelatorioAssincrono,
        formato: tarefa.formato as FormatoRelatorio,
        geradoEm: agora,
        organizacaoId: tarefa.organizacaoId,
        tarefaId: tarefa.id,
      });
      const expiraEm = new Date(agora.getTime() + ServicoRelatorioAssincrono.RETENCAO_HORAS * 60 * 60 * 1000);
      const concluida = await this.tarefas.concluir(tarefa.id, arquivo, agora, expiraEm);
      await this.notificar(concluida, 'relatorio.concluido');
    } catch (erro) {
      const definitiva = contexto.ultimaTentativa || erro instanceof ErroTarefaIrrecuperavel;
      await this.tarefas.registrarFalha(tarefa.id, (erro as Error).message ?? String(erro), definitiva, this.relogio());
      if (definitiva) {
        const falha = await this.tarefas.buscarResumo(tarefa.id);
        if (falha) await this.notificar(falha, 'relatorio.falhou');
      }
      throw erro;
    }
  }

  /** Admin: devolve uma tarefa FALHOU para a fila (com um id de job novo). */
  public async reprocessar(id: string, quem: UsuarioAutenticado) {
    if (!(await this.tarefas.reabrir(id))) {
      const existe = await this.tarefas.buscarResumo(id);
      if (!existe) throw new ErroNaoEncontrado('Tarefa', id);
      throw new ErroConflito(`Só tarefas com status FALHOU podem ser reprocessadas (atual: ${existe.status}).`);
    }
    await this.journal.registrar({
      operacao: 'REPROCESSAR',
      entidade: 'TarefaRelatorio',
      dadosDepois: { id },
      usuarioResponsavel: quem.usuario,
    });
    await this.fila.enfileirar('gerar-relatorio', { tarefaId: id }, { idJob: `${id}:reprocesso:${randomUUID()}` });
    return ServicoRelatorioAssincrono.paraStatus((await this.tarefas.buscarResumo(id)) as ResumoTarefa);
  }

  public async listar(filtro: { chaveApiId?: string; status?: StatusTarefa; limite: number }) {
    return (await this.tarefas.listar(filtro)).map(ServicoRelatorioAssincrono.paraStatus);
  }

  /** Processador do job recorrente de limpeza. */
  public async limparExpirados(): Promise<number> {
    return this.tarefas.excluirExpiradas(this.relogio());
  }

  public metricasFila() {
    return this.fila.obterMetricas().then((metricas) => ({ tipo: this.fila.tipo, ...metricas }));
  }

  /** Monta as linhas de cada tipo de relatório (sempre restritas à organização, se houver). */
  private async gerarLinhas(tipo: TipoRelatorioAssincrono, organizacaoId?: string): Promise<LinhaRelatorio[]> {
    const anoAtual = this.relogio().getFullYear();
    switch (tipo) {
      case TipoRelatorioAssincrono.RASTREABILIDADE: {
        return (await this.analises.listarRastreabilidade(organizacaoId)).map((l) => ({ ...l }));
      }
      case TipoRelatorioAssincrono.RENTABILIDADE: {
        const parametros = await this.servicoAnalise.parametrosRentabilidade();
        const amostras = await this.analises.listarAmostrasEquipamentos({ organizacaoId });
        return amostras.map((a) => ({ ...AnalisadorRentabilidade.estimar(a, parametros) }));
      }
      case TipoRelatorioAssincrono.PREVISAO_VIDA_UTIL: {
        const modelos = await this.servicoAnalise.modelosVigentes('sistema');
        const { coeficienteDepreciacaoAnual } = await this.servicoAnalise.parametrosRentabilidade();
        const amostras = await this.analises.listarAmostrasEquipamentos({ organizacaoId, apenasAtivos: true });
        return amostras.map(({ equipamento }) => {
          const dados = equipamento.paraJSON();
          const projecao = AnalisadorVidaUtil.projetar(modelos.get(equipamento.tipo), dados, anoAtual);
          return {
            codigoBarrasInterno: dados.codigoBarrasInterno,
            tipo: dados.tipo,
            marca: dados.marca,
            modelo: dados.modelo,
            anoFabricacao: dados.anoFabricacao,
            estadoFisico: dados.estadoFisico,
            statusRastreamento: dados.statusRastreamento,
            idadeAnos: projecao.idadeAnos,
            anosRestantesPrevistos: projecao.anosRestantes,
            anoPrevistoInservivel: projecao.anoPrevistoInservivel,
            confiancaModelo: projecao.confianca,
            valorResidualAtual: equipamento.calcularDepreciacao(coeficienteDepreciacaoAnual, anoAtual).valorAtual,
          };
        });
      }
    }
  }

  /** Envia o webhook assinado. Falha de entrega não derruba o job: o parceiro ainda pode consultar por polling. */
  private async notificar(tarefa: ResumoTarefa, evento: 'relatorio.concluido' | 'relatorio.falhou'): Promise<void> {
    if (!tarefa.webhookUrl || !tarefa.chaveApiId) return;
    const chave = await this.chaves.buscarPorId(tarefa.chaveApiId);
    if (!chave) return;
    const corpo = JSON.stringify({ evento, enviadoEm: this.relogio(), tarefa: ServicoRelatorioAssincrono.paraStatus(tarefa) });
    const resposta = await this.opcoes
      .enviarWebhook(tarefa.webhookUrl, corpo, {
        'content-type': 'application/json',
        'x-greencode-evento': evento,
        'x-greencode-entrega': randomUUID(),
        'x-greencode-assinatura': ServicoRelatorioAssincrono.assinar(corpo, chave.segredoWebhook),
      })
      .catch(() => null);
    if (resposta?.ok) await this.tarefas.marcarWebhookEntregue(tarefa.id, this.relogio());
  }

  /** Cabeçalho de assinatura: "sha256=" + HMAC-SHA256(corpo, segredo) em hexadecimal. */
  public static assinar(corpo: string, segredo: string): string {
    return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
  }

  /** Só https (http apenas se liberado no .env para desenvolvimento) e sem usuário/senha na URL. */
  public static validarUrlWebhook(texto: string, permitirHttp: boolean): string {
    let url: URL;
    try {
      url = new URL(texto);
    } catch {
      throw new ErroValidacao('webhookUrl não é uma URL válida.');
    }
    const protocolos = permitirHttp ? ['https:', 'http:'] : ['https:'];
    if (!protocolos.includes(url.protocol)) throw new ErroValidacao(`webhookUrl deve usar ${protocolos.join(' ou ')}.`);
    if (url.username || url.password) throw new ErroValidacao('webhookUrl não pode conter credenciais.');
    return url.toString();
  }

  /** Visão pública da tarefa, com os links de acompanhamento (HATEOAS). */
  public static paraStatus(tarefa: ResumoTarefa) {
    const base = `${PREFIXO_RELATORIOS_PUBLICOS}/${tarefa.id}`;
    return {
      id: tarefa.id,
      tipo: tarefa.tipo,
      formato: tarefa.formato,
      status: tarefa.status,
      tentativas: tarefa.tentativas,
      erro: tarefa.erro,
      organizacaoId: tarefa.organizacaoId,
      criadaEm: tarefa.criadaEm,
      concluidaEm: tarefa.concluidaEm,
      expiraEm: tarefa.expiraEm,
      tamanhoBytes: tarefa.tamanhoBytes,
      webhookEntregueEm: tarefa.webhookEntregueEm,
      links: { status: base, download: tarefa.status === StatusTarefa.CONCLUIDA ? `${base}/download` : null },
    };
  }

  private async obterDoParceiro(id: string, parceiro: ChaveApi): Promise<ResumoTarefa> {
    const tarefa = await this.tarefas.buscarResumo(id);
    if (!tarefa || tarefa.chaveApiId !== parceiro.id) throw new ErroNaoEncontrado('Relatório', id);
    return tarefa;
  }
}
