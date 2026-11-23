"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicoOrganizacao = void 0;
const crypto_1 = require("crypto");
const Contrato_1 = require("../dominio/Contrato");
const Organizacao_1 = require("../dominio/Organizacao");
const arquivos_1 = require("../persistencia/arquivos");
/**
 * Cadastro e consulta de Organizações e seus Contratos (FR02, FR03).
 * O CNPJ (sem máscara) é o identificador da organização.
 */
class ServicoOrganizacao {
    repositorio;
    validadorCNPJ;
    constructor(repositorio, validadorCNPJ) {
        this.repositorio = repositorio;
        this.validadorCNPJ = validadorCNPJ;
    }
    /**
     * Formato esperado de `dados`:
     * {
     *   razaoSocial, cnpj, inscricaoEstadual?, enderecoCompleto, telefone?, email?,
     *   contrato: { dataAssinatura, dataVencimento, clausulas?, valorMensal, renovacaoAutomatica? }
     * }
     */
    cadastrarOrganizacao(dados) {
        if (!this.validadorCNPJ.validar(dados?.cnpj)) {
            throw new Error(this.validadorCNPJ.obterMensagemErro());
        }
        const cnpj = ServicoOrganizacao.normalizarCNPJ(dados.cnpj);
        if (this.repositorio.carregarEntidade(arquivos_1.ARQUIVOS.ORGANIZACOES, cnpj)) {
            throw new Error(`Já existe uma organização com o CNPJ ${cnpj}.`);
        }
        if (!dados.contrato)
            throw new Error('Os dados do contrato são obrigatórios.');
        const contrato = new Contrato_1.Contrato((0, crypto_1.randomUUID)(), cnpj, new Date(dados.contrato.dataAssinatura), new Date(dados.contrato.dataVencimento), dados.contrato.clausulas ?? [], Number(dados.contrato.valorMensal), Boolean(dados.contrato.renovacaoAutomatica));
        const organizacao = new Organizacao_1.Organizacao(cnpj, dados.razaoSocial, cnpj, dados.inscricaoEstadual ?? '', dados.enderecoCompleto ?? '', dados.telefone ?? '', dados.email ?? '', contrato);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.ORGANIZACOES, organizacao);
        return organizacao;
    }
    /** Aceita o CNPJ com ou sem máscara. */
    buscarOrganizacao(id) {
        const dados = this.repositorio.carregarEntidade(arquivos_1.ARQUIVOS.ORGANIZACOES, ServicoOrganizacao.normalizarCNPJ(id));
        if (!dados)
            throw new Error(`Organização ${id} não encontrada.`);
        return Organizacao_1.Organizacao.reconstruir(dados);
    }
    listarOrganizacoesAtivas() {
        return this.repositorio
            .listarEntidades(arquivos_1.ARQUIVOS.ORGANIZACOES)
            .map((dados) => Organizacao_1.Organizacao.reconstruir(dados))
            .filter((o) => o.isAtivo());
    }
    renovarContrato(organizacaoId, novoVencimento) {
        const organizacao = this.buscarOrganizacao(organizacaoId);
        organizacao.getContratoVigente().renovar(novoVencimento);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.ORGANIZACOES, organizacao);
    }
    alterarEndereco(organizacaoId, novoEndereco) {
        const organizacao = this.buscarOrganizacao(organizacaoId);
        organizacao.alterarEndereco(novoEndereco);
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.ORGANIZACOES, organizacao);
    }
    desativarOrganizacao(organizacaoId) {
        const organizacao = this.buscarOrganizacao(organizacaoId);
        organizacao.desativar();
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.ORGANIZACOES, organizacao);
    }
    static normalizarCNPJ(cnpj) {
        return String(cnpj).toUpperCase().replace(/[.\/\-\s]/g, '');
    }
}
exports.ServicoOrganizacao = ServicoOrganizacao;
