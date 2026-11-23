import { ResultadoRentabilidade } from '../domain/analise/AnalisadorRentabilidade';
import { ResultadoVidaUtil } from '../domain/analise/AnalisadorVidaUtil';
import { ChaveApi } from '../domain/entidades/ChaveApi';
import { DadosNovoEquipamento, PropsEquipamento } from '../domain/entidades/Equipamento';
import { PropsLote } from '../domain/entidades/Lote';
import { StatusLote } from '../domain/enums/StatusLote';
import { TipoAnalise } from '../domain/enums/TipoAnalise';
import { ErroNaoEncontrado, ErroValidacao } from '../domain/erros/ErrosAplicacao';
import { ServicoAnalise } from './ServicoAnalise';
import { ServicoEquipamento } from './ServicoEquipamento';
import { ServicoLote } from './ServicoLote';

export interface FiltroLotesPublico {
  organizacaoId?: string;
  status?: StatusLote;
  inicio?: Date;
  fim?: Date;
}

export interface SubmissaoLote {
  organizacaoId?: string;
  notaFiscal: string;
  transportadora: string;
  dataEntrada?: Date;
  observacoes?: string;
  equipamentos: DadosNovoEquipamento[];
}

/**
 * Fachada da API pública. Reaproveita os serviços internos, mas devolve DTOs próprios:
 * o contrato com parceiros não muda quando o modelo interno muda, e campos internos
 * (versão, ids de usuários, responsáveis) nunca vazam.
 */
export class ServicoApiPublica {
  constructor(
    private readonly lotes: ServicoLote,
    private readonly equipamentos: ServicoEquipamento,
    private readonly analises: ServicoAnalise,
  ) {}

  /** Rastreabilidade de um equipamento da organização do parceiro (404 se for de outra). */
  public async rastrear(codigo: string, parceiro: ChaveApi) {
    const r = await this.equipamentos.rastrearEquipamento(codigo);
    if (!r.organizacao || !parceiro.enxergaOrganizacao(r.organizacao.id)) throw new ErroNaoEncontrado('Equipamento', codigo);
    return {
      equipamento: ServicoApiPublica.equipamentoPublico(r.equipamento),
      localAtual: r.localAtual,
      valorResidualEstimado: r.valoracao.valorAtual,
      lote: { id: r.lote.id, notaFiscal: r.lote.notaFiscal, dataEntrada: r.lote.dataEntrada, status: r.lote.statusProcessamento },
      historico: r.movimentacoes.map((m) => ({ dataHora: m.dataHora, origem: m.origem, destino: m.destino, observacao: m.observacao })),
    };
  }

  public async listarLotes(filtro: FiltroLotesPublico, parceiro: ChaveApi) {
    const organizacaoId = parceiro.resolverOrganizacao(filtro.organizacaoId);
    const lotes = await this.lotes.listarLotes({ ...filtro, organizacaoId });
    return lotes.map((l) => ({
      ...ServicoApiPublica.lotePublico(l),
      quantidadeEquipamentos: l.quantidadeEquipamentos,
      pesoTotalKg: l.pesoTotalKg,
    }));
  }

  public async buscarLote(id: string, parceiro: ChaveApi) {
    const lote = await this.lotes.buscarLote(id);
    if (!parceiro.enxergaOrganizacao(lote.organizacaoId)) throw new ErroNaoEncontrado('Lote', id);
    return {
      ...ServicoApiPublica.lotePublico(lote),
      pesoTotalKg: lote.pesoTotalKg,
      equipamentos: lote.equipamentos.map(ServicoApiPublica.equipamentoPublico),
    };
  }

  /** Submete lote + equipamentos numa transação; a chave vira o responsável no journal. */
  public async submeterLote(dados: SubmissaoLote, parceiro: ChaveApi) {
    const organizacaoId = parceiro.resolverOrganizacao(dados.organizacaoId);
    if (!organizacaoId) throw new ErroValidacao('Chaves globais precisam informar "organizacaoId" na submissão de lotes.');
    const { equipamentos, ...lote } = dados;
    const criado = await this.lotes.criarLoteComEquipamentos({ ...lote, organizacaoId }, equipamentos, { usuario: parceiro.identificacao });
    return {
      ...ServicoApiPublica.lotePublico(criado.lote),
      equipamentos: criado.equipamentos.map(ServicoApiPublica.equipamentoPublico),
    };
  }

  /** Indicadores agregados de mercado (sem dados de nenhuma organização específica). */
  public async rentabilidade() {
    const execucao = await this.analises.obterUltima(TipoAnalise.RENTABILIDADE, 'api-publica');
    const r = execucao.resultado as unknown as ResultadoRentabilidade;
    return {
      geradoEm: execucao.concluidaEm,
      totalEquipamentos: r.totalEquipamentos,
      porTipo: r.porTipo,
      porTipoEEstado: r.porTipoEEstado,
      destinos: r.destinos,
    };
  }

  public async vidaUtil() {
    const execucao = await this.analises.obterUltima(TipoAnalise.VIDA_UTIL, 'api-publica');
    const r = execucao.resultado as unknown as ResultadoVidaUtil;
    return { geradoEm: execucao.concluidaEm, totalAmostras: r.totalAmostras, modelos: r.modelos };
  }

  private static lotePublico(l: PropsLote) {
    return {
      id: l.id,
      organizacaoId: l.organizacaoId,
      notaFiscal: l.notaFiscal,
      transportadora: l.transportadora,
      dataEntrada: l.dataEntrada,
      status: l.statusProcessamento,
      observacoes: l.observacoes,
    };
  }

  private static equipamentoPublico(e: PropsEquipamento) {
    return {
      codigoBarrasInterno: e.codigoBarrasInterno,
      tipo: e.tipo,
      marca: e.marca,
      modelo: e.modelo,
      anoFabricacao: e.anoFabricacao,
      estadoFisico: e.estadoFisico,
      pesoQuilogramas: e.pesoQuilogramas,
      statusRastreamento: e.statusRastreamento,
    };
  }
}
