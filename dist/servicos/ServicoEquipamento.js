"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicoEquipamento = void 0;
const Lote_1 = require("../dominio/Lote");
const StatusLote_1 = require("../enums/StatusLote");
const StatusRastreamento_1 = require("../enums/StatusRastreamento");
const TipoEquipamento_1 = require("../enums/TipoEquipamento");
const arquivos_1 = require("../persistencia/arquivos");
/**
 * Rastreamento, status, estado físico e código de barras dos equipamentos (FR05, FR06).
 */
class ServicoEquipamento {
    static SIGLAS = {
        [TipoEquipamento_1.TipoEquipamento.COMPUTADOR_MESA]: 'CPU',
        [TipoEquipamento_1.TipoEquipamento.NOTEBOOK]: 'NTB',
        [TipoEquipamento_1.TipoEquipamento.MONITOR]: 'MON',
        [TipoEquipamento_1.TipoEquipamento.IMPRESSORA]: 'IMP',
        [TipoEquipamento_1.TipoEquipamento.SERVIDOR]: 'SRV',
        [TipoEquipamento_1.TipoEquipamento.ROTEADOR]: 'RTD',
        [TipoEquipamento_1.TipoEquipamento.CABO_ESTRUTURADO]: 'CAB',
        [TipoEquipamento_1.TipoEquipamento.FONTE_ALIMENTACAO]: 'FNT',
    };
    static STATUS_DESMONTE = [StatusRastreamento_1.StatusRastreamento.AGUARDANDO_DESMONTE, StatusRastreamento_1.StatusRastreamento.EM_DESMONTE];
    static LOTE_TRIADO = [StatusLote_1.StatusLote.TRIAGEM_CONCLUIDA, StatusLote_1.StatusLote.ENCAMINHADO, StatusLote_1.StatusLote.FINALIZADO];
    repositorio;
    constructor(repositorio) {
        this.repositorio = repositorio;
    }
    rastrearEquipamento(id) {
        const { equipamento } = this.localizar(id);
        return {
            equipamentoId: equipamento.getId(),
            codigoBarrasInterno: equipamento.getCodigoBarrasInterno(),
            loteId: equipamento.getLoteId(),
            estadoFisicoAtual: equipamento.getEstadoFisico(),
            statusAtual: equipamento.getStatusRastreamento(),
            movimentacoes: equipamento.getHistoricoMovimentacao(),
        };
    }
    /** Queda de duas categorias ou mais exige justificativa (FR06). */
    atualizarEstadoFisico(id, novoEstado, justificativa, responsavel) {
        const { lote, equipamento } = this.localizar(id);
        equipamento.alterarEstadoFisico(novoEstado, justificativa, responsavel);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.LOTES, lote);
    }
    /** Regra: só vai para desmonte depois que a triagem do lote foi concluída. */
    atualizarStatus(id, novoStatus, justificativa, responsavel) {
        const { lote, equipamento } = this.localizar(id);
        if (ServicoEquipamento.STATUS_DESMONTE.includes(novoStatus) &&
            !ServicoEquipamento.LOTE_TRIADO.includes(lote.getStatusProcessamento())) {
            throw new Error(`O equipamento só pode ir para desmonte após a triagem completa do lote ${lote.getId()}.`);
        }
        equipamento.atualizarStatus(novoStatus, justificativa, responsavel);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.LOTES, lote);
    }
    registrarMovimentacao(id, destino, responsavel) {
        const { lote, equipamento } = this.localizar(id);
        equipamento.registrarMovimentacao(destino, responsavel);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.LOTES, lote);
    }
    /** Ex.: (NOTEBOOK, 42) → "GC-NTB-000042". */
    gerarCodigoBarras(tipo, sequencia) {
        if (!Number.isInteger(sequencia) || sequencia <= 0 || sequencia > 999999) {
            throw new Error('A sequência deve ser um inteiro entre 1 e 999999.');
        }
        return `GC-${ServicoEquipamento.SIGLAS[tipo]}-${String(sequencia).padStart(6, '0')}`;
    }
    /** Próximo número livre, usado no id (EQP-000042) e no código de barras. */
    proximaSequencia() {
        let maior = 0;
        for (const dados of this.repositorio.listarEntidades(arquivos_1.ARQUIVOS.LOTES)) {
            for (const e of dados.equipamentos ?? []) {
                maior = Math.max(maior, Number(String(e.id).replace('EQP-', '')) || 0);
            }
        }
        return maior + 1;
    }
    /** O equipamento é gravado dentro do lote; por isso a busca percorre os lotes. */
    localizar(id) {
        for (const dados of this.repositorio.listarEntidades(arquivos_1.ARQUIVOS.LOTES)) {
            const lote = Lote_1.Lote.reconstruir(dados);
            const equipamento = lote.getEquipamentos().find((e) => e.getId() === id || e.getCodigoBarrasInterno() === id);
            if (equipamento)
                return { lote, equipamento };
        }
        throw new Error(`Equipamento ${id} não encontrado.`);
    }
}
exports.ServicoEquipamento = ServicoEquipamento;
