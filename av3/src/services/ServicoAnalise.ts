import { ExecucaoAnalise } from '@prisma/client';
import { AnalisadorEficiencia } from '../domain/analise/AnalisadorEficiencia';
import { AnalisadorRentabilidade, ParametrosRentabilidade } from '../domain/analise/AnalisadorRentabilidade';
import { AnalisadorVidaUtil, ModeloVidaUtil } from '../domain/analise/AnalisadorVidaUtil';
import { OrigemExecucao, TipoAnalise } from '../domain/enums/TipoAnalise';
import { TipoEquipamento } from '../domain/enums/TipoEquipamento';
import { ErroNaoEncontrado } from '../domain/erros/ErrosAplicacao';
import { adicionarMeses, arredondar2 } from '../domain/utils/datas';
import { AnaliseRepository } from '../repositories/AnaliseRepository';
import { GerenciadorTransacao } from '../repositories/infra';
import { ServicoParametros } from './ServicoParametros';
import { Periodo, Relogio, relogioDoSistema } from './tipos';

export interface PedidoExecucao {
  origem: OrigemExecucao;
  solicitante: string;
  /** Só a eficiência usa período (padrão: últimos 12 meses). */
  periodo?: Periodo;
}

/**
 * Camada analítica: busca as amostras, chama os analisadores do domínio (funções puras)
 * e persiste cada execução para consulta histórica e comparação previsto × realizado.
 */
export class ServicoAnalise {
  public static readonly MESES_PADRAO_EFICIENCIA = 12;

  constructor(
    private readonly repositorio: AnaliseRepository,
    private readonly parametros: ServicoParametros,
    private readonly transacao: GerenciadorTransacao,
    private readonly relogio: Relogio = relogioDoSistema,
  ) {}

  /** Executa e persiste uma análise. */
  public async executar(tipo: TipoAnalise, pedido: PedidoExecucao): Promise<ExecucaoAnalise> {
    switch (tipo) {
      case TipoAnalise.EFICIENCIA_OPERACIONAL:
        return this.executarEficiencia(pedido);
      case TipoAnalise.RENTABILIDADE:
        return this.executarRentabilidade(pedido);
      case TipoAnalise.VIDA_UTIL:
        return this.executarVidaUtil(pedido);
    }
  }

  /** Executa as três análises em sequência (tarefa agendada). */
  public async executarTodas(pedido: PedidoExecucao) {
    const resultados = [];
    for (const tipo of Object.values(TipoAnalise)) {
      const execucao = await this.executar(tipo, pedido);
      resultados.push({ tipo, execucaoId: execucao.id, amostras: execucao.amostras, duracaoMs: execucao.duracaoMs });
    }
    return resultados;
  }

  /** Resultado mais recente; se nunca rodou, executa agora (SOB_DEMANDA) para não devolver vazio. */
  public async obterUltima(tipo: TipoAnalise, solicitante: string): Promise<ExecucaoAnalise> {
    return (await this.repositorio.ultimaExecucao(tipo)) ?? this.executar(tipo, { origem: OrigemExecucao.SOB_DEMANDA, solicitante });
  }

  public async buscarExecucao(id: string): Promise<ExecucaoAnalise> {
    const execucao = await this.repositorio.buscarExecucao(id);
    if (!execucao) throw new ErroNaoEncontrado('Execução de análise', id);
    return execucao;
  }

  public listarExecucoes(filtro: { tipo?: TipoAnalise; limite: number }) {
    return this.repositorio.listarExecucoes(filtro);
  }

  public historicoPrevisoes(filtro: { tipo?: TipoEquipamento; limite: number }) {
    return this.repositorio.historicoPrevisoes(filtro);
  }

  /** Modelos de vida útil da última execução (usados nas projeções por equipamento). */
  public async modelosVigentes(solicitante: string): Promise<Map<TipoEquipamento, ModeloVidaUtil>> {
    const execucao = await this.obterUltima(TipoAnalise.VIDA_UTIL, solicitante);
    const resultado = execucao.resultado as unknown as { modelos: ModeloVidaUtil[] };
    return new Map(resultado.modelos.map((m) => [m.tipo, m]));
  }

  public async parametrosRentabilidade(): Promise<ParametrosRentabilidade> {
    const valores = await this.parametros.obterValores();
    return { coeficienteDepreciacaoAnual: valores.COEFICIENTE_DEPRECIACAO_ANUAL, custoDescartePorKg: valores.CUSTO_DESCARTE_POR_KG };
  }

  private async executarEficiencia(pedido: PedidoExecucao): Promise<ExecucaoAnalise> {
    const iniciadaEm = this.relogio();
    const periodo = pedido.periodo ?? { inicio: adicionarMeses(iniciadaEm, -ServicoAnalise.MESES_PADRAO_EFICIENCIA), fim: iniciadaEm };
    const amostras = await this.repositorio.listarAmostrasTriagem(periodo);
    const resultado = AnalisadorEficiencia.analisar(amostras);
    return this.repositorio.salvarExecucao({
      tipo: TipoAnalise.EFICIENCIA_OPERACIONAL,
      origem: pedido.origem,
      solicitante: pedido.solicitante,
      parametros: { periodo },
      resultado,
      amostras: amostras.length,
      iniciadaEm,
      concluidaEm: this.relogio(),
    });
  }

  private async executarRentabilidade(pedido: PedidoExecucao): Promise<ExecucaoAnalise> {
    const iniciadaEm = this.relogio();
    const parametros = await this.parametrosRentabilidade();
    const amostras = await this.repositorio.listarAmostrasEquipamentos({});
    const resultado = AnalisadorRentabilidade.analisar(amostras, parametros);
    return this.repositorio.salvarExecucao({
      tipo: TipoAnalise.RENTABILIDADE,
      origem: pedido.origem,
      solicitante: pedido.solicitante,
      parametros,
      resultado,
      amostras: amostras.length,
      iniciadaEm,
      concluidaEm: this.relogio(),
    });
  }

  /** Ajusta os modelos e calcula quanto cada previsão mudou desde a anterior. */
  private async executarVidaUtil(pedido: PedidoExecucao): Promise<ExecucaoAnalise> {
    const iniciadaEm = this.relogio();
    const amostras = await this.repositorio.listarAmostrasEquipamentos({});
    const { modelos, totalAmostras } = AnalisadorVidaUtil.analisar(amostras);

    return this.transacao.executar(async (tx) => {
      const anteriores = await this.repositorio.ultimasPrevisoesPorTipo(tx);
      const comVariacao = modelos.map((m) => {
        const anterior = anteriores.get(m.tipo)?.idadeInservivelAnos ?? null;
        const variacaoAnos = anterior !== null && m.idadeInservivelAnos !== null ? arredondar2(m.idadeInservivelAnos - anterior) : null;
        return { ...m, variacaoAnos };
      });
      return this.repositorio.salvarExecucao(
        {
          tipo: TipoAnalise.VIDA_UTIL,
          origem: pedido.origem,
          solicitante: pedido.solicitante,
          parametros: { metodo: 'MINIMOS_QUADRADOS_ORDINARIOS', minimoAmostras: AnalisadorVidaUtil.MINIMO_AMOSTRAS },
          resultado: { totalAmostras, modelos: comVariacao },
          amostras: totalAmostras,
          iniciadaEm,
          concluidaEm: this.relogio(),
        },
        comVariacao,
        tx,
      );
    });
  }
}
