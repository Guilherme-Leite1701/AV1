import { Equipamento } from '../dominio/Equipamento';
import { Lote } from '../dominio/Lote';
import { StatusLote } from '../enums/StatusLote';
import { StatusRastreamento } from '../enums/StatusRastreamento';
import { ARQUIVOS } from '../persistencia/arquivos';
import { RepositorioArquivo } from '../persistencia/RepositorioArquivo';
import { ValidadorDataEntrada } from '../validadores/ValidadorDataEntrada';

/**
 * Entrada e triagem de Lotes (FR04).
 * Os equipamentos são gravados dentro do seu lote (agregação Lote --> Equipamento).
 */
export class ServicoLote {
  private repositorio: RepositorioArquivo;

  constructor(repositorio: RepositorioArquivo) {
    this.repositorio = repositorio;
  }

  /**
   * Formato esperado de `dados`:
   * { dataEntrada?: Date (padrão: hoje), organizacaoId (CNPJ), notaFiscal, transportadora, observacoes? }
   */
  public criarLote(dados: any): Lote {
    const validador = new ValidadorDataEntrada();
    const dataEntrada: Date = dados?.dataEntrada ?? new Date();
    if (!validador.validar(dataEntrada)) {
      throw new Error(validador.obterMensagemErro());
    }
    if (!dados.organizacaoId || !dados.notaFiscal || !dados.transportadora) {
      throw new Error('Organização, nota fiscal e transportadora são obrigatórias.');
    }
    const organizacao = this.repositorio.carregarEntidade(ARQUIVOS.ORGANIZACOES, dados.organizacaoId);
    if (!organizacao) throw new Error(`Organização ${dados.organizacaoId} não encontrada.`);
    if (!organizacao.ativo) throw new Error(`A organização ${dados.organizacaoId} está desativada.`);

    const lote = new Lote(
      this.proximoId(),
      dataEntrada,
      dados.organizacaoId,
      dados.notaFiscal,
      dados.transportadora,
      dados.observacoes ?? '',
    );
    this.repositorio.salvarEntidade(ARQUIVOS.LOTES, lote);
    return lote;
  }

  public buscarLote(loteId: string): Lote {
    const dados = this.repositorio.carregarEntidade(ARQUIVOS.LOTES, loteId);
    if (!dados) throw new Error(`Lote ${loteId} não encontrado.`);
    return Lote.reconstruir(dados);
  }

  /** Equipamentos só entram em lotes ainda não triados. */
  public adicionarEquipamentoLote(loteId: string, equipamento: Equipamento): void {
    const lote = this.buscarLote(loteId);
    if (lote.getStatusProcessamento() !== StatusLote.RECEBIDO) {
      throw new Error('Só é possível adicionar equipamentos a um lote RECEBIDO.');
    }
    lote.adicionarEquipamento(equipamento);
    this.repositorio.salvarEntidade(ARQUIVOS.LOTES, lote);
  }

  /** Inicia a triagem: o lote e seus equipamentos passam para EM_TRIAGEM. */
  public processarTriagem(loteId: string, responsavel: string = 'sistema'): void {
    const lote = this.buscarLote(loteId);
    if (lote.getStatusProcessamento() !== StatusLote.RECEBIDO) {
      throw new Error(`Só é possível iniciar a triagem de um lote RECEBIDO (atual: ${lote.getStatusProcessamento()}).`);
    }
    if (lote.getEquipamentos().length === 0) {
      throw new Error('O lote não possui equipamentos.');
    }
    for (const equipamento of lote.getEquipamentos()) {
      equipamento.atualizarStatus(StatusRastreamento.EM_TRIAGEM, 'Início da triagem do lote.', responsavel);
    }
    lote.alterarStatus(StatusLote.EM_TRIAGEM);
    this.repositorio.salvarEntidade(ARQUIVOS.LOTES, lote);
  }

  /** Conclui a triagem; a partir daqui os equipamentos podem seguir para desmonte. */
  public concluirTriagem(loteId: string): void {
    const lote = this.buscarLote(loteId);
    if (lote.getStatusProcessamento() !== StatusLote.EM_TRIAGEM) {
      throw new Error(`Só é possível concluir a triagem de um lote EM_TRIAGEM (atual: ${lote.getStatusProcessamento()}).`);
    }
    lote.alterarStatus(StatusLote.TRIAGEM_CONCLUIDA);
    this.repositorio.salvarEntidade(ARQUIVOS.LOTES, lote);
  }

  /** Lotes com data de entrada entre `dataInicio` e `dataFim` (inclusive). */
  public consultarLotePorPeriodo(dataInicio: Date, dataFim: Date): Lote[] {
    return this.repositorio
      .listarEntidades(ARQUIVOS.LOTES)
      .map((dados) => Lote.reconstruir(dados))
      .filter((lote) => {
        const entrada = lote.getDataEntrada().getTime();
        return entrada >= dataInicio.getTime() && entrada <= dataFim.getTime();
      });
  }

  /** Ids legíveis e sequenciais: LOTE-000001, LOTE-000002... */
  private proximoId(): string {
    const maior = this.repositorio
      .listarEntidades(ARQUIVOS.LOTES)
      .reduce((max, l) => Math.max(max, Number(String(l.id).replace('LOTE-', '')) || 0), 0);
    return `LOTE-${String(maior + 1).padStart(6, '0')}`;
  }
}
