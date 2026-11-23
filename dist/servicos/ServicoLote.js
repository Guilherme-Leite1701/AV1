"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicoLote = void 0;
const Lote_1 = require("../dominio/Lote");
const StatusLote_1 = require("../enums/StatusLote");
const StatusRastreamento_1 = require("../enums/StatusRastreamento");
const arquivos_1 = require("../persistencia/arquivos");
const ValidadorDataEntrada_1 = require("../validadores/ValidadorDataEntrada");
/**
 * Entrada e triagem de Lotes (FR04).
 * Os equipamentos são gravados dentro do seu lote (agregação Lote --> Equipamento).
 */
class ServicoLote {
    repositorio;
    constructor(repositorio) {
        this.repositorio = repositorio;
    }
    /**
     * Formato esperado de `dados`:
     * { dataEntrada?: Date (padrão: hoje), organizacaoId (CNPJ), notaFiscal, transportadora, observacoes? }
     */
    criarLote(dados) {
        const validador = new ValidadorDataEntrada_1.ValidadorDataEntrada();
        const dataEntrada = dados?.dataEntrada ?? new Date();
        if (!validador.validar(dataEntrada)) {
            throw new Error(validador.obterMensagemErro());
        }
        if (!dados.organizacaoId || !dados.notaFiscal || !dados.transportadora) {
            throw new Error('Organização, nota fiscal e transportadora são obrigatórias.');
        }
        const organizacao = this.repositorio.carregarEntidade(arquivos_1.ARQUIVOS.ORGANIZACOES, dados.organizacaoId);
        if (!organizacao)
            throw new Error(`Organização ${dados.organizacaoId} não encontrada.`);
        if (!organizacao.ativo)
            throw new Error(`A organização ${dados.organizacaoId} está desativada.`);
        const lote = new Lote_1.Lote(this.proximoId(), dataEntrada, dados.organizacaoId, dados.notaFiscal, dados.transportadora, dados.observacoes ?? '');
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.LOTES, lote);
        return lote;
    }
    buscarLote(loteId) {
        const dados = this.repositorio.carregarEntidade(arquivos_1.ARQUIVOS.LOTES, loteId);
        if (!dados)
            throw new Error(`Lote ${loteId} não encontrado.`);
        return Lote_1.Lote.reconstruir(dados);
    }
    /** Equipamentos só entram em lotes ainda não triados. */
    adicionarEquipamentoLote(loteId, equipamento) {
        const lote = this.buscarLote(loteId);
        if (lote.getStatusProcessamento() !== StatusLote_1.StatusLote.RECEBIDO) {
            throw new Error('Só é possível adicionar equipamentos a um lote RECEBIDO.');
        }
        lote.adicionarEquipamento(equipamento);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.LOTES, lote);
    }
    /** Inicia a triagem: o lote e seus equipamentos passam para EM_TRIAGEM. */
    processarTriagem(loteId, responsavel = 'sistema') {
        const lote = this.buscarLote(loteId);
        if (lote.getStatusProcessamento() !== StatusLote_1.StatusLote.RECEBIDO) {
            throw new Error(`Só é possível iniciar a triagem de um lote RECEBIDO (atual: ${lote.getStatusProcessamento()}).`);
        }
        if (lote.getEquipamentos().length === 0) {
            throw new Error('O lote não possui equipamentos.');
        }
        for (const equipamento of lote.getEquipamentos()) {
            equipamento.atualizarStatus(StatusRastreamento_1.StatusRastreamento.EM_TRIAGEM, 'Início da triagem do lote.', responsavel);
        }
        lote.alterarStatus(StatusLote_1.StatusLote.EM_TRIAGEM);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.LOTES, lote);
    }
    /** Conclui a triagem; a partir daqui os equipamentos podem seguir para desmonte. */
    concluirTriagem(loteId) {
        const lote = this.buscarLote(loteId);
        if (lote.getStatusProcessamento() !== StatusLote_1.StatusLote.EM_TRIAGEM) {
            throw new Error(`Só é possível concluir a triagem de um lote EM_TRIAGEM (atual: ${lote.getStatusProcessamento()}).`);
        }
        lote.alterarStatus(StatusLote_1.StatusLote.TRIAGEM_CONCLUIDA);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.LOTES, lote);
    }
    /** Lotes com data de entrada entre `dataInicio` e `dataFim` (inclusive). */
    consultarLotePorPeriodo(dataInicio, dataFim) {
        return this.repositorio
            .listarEntidades(arquivos_1.ARQUIVOS.LOTES)
            .map((dados) => Lote_1.Lote.reconstruir(dados))
            .filter((lote) => {
            const entrada = lote.getDataEntrada().getTime();
            return entrada >= dataInicio.getTime() && entrada <= dataFim.getTime();
        });
    }
    /** Ids legíveis e sequenciais: LOTE-000001, LOTE-000002... */
    proximoId() {
        const maior = this.repositorio
            .listarEntidades(arquivos_1.ARQUIVOS.LOTES)
            .reduce((max, l) => Math.max(max, Number(String(l.id).replace('LOTE-', '')) || 0), 0);
        return `LOTE-${String(maior + 1).padStart(6, '0')}`;
    }
}
exports.ServicoLote = ServicoLote;
