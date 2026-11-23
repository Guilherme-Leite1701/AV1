"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FabricaObjetos = void 0;
const Administrador_1 = require("../autenticacao/Administrador");
const Auditor_1 = require("../autenticacao/Auditor");
const GestorAlmoxarifado_1 = require("../autenticacao/GestorAlmoxarifado");
const OperadorCadastro_1 = require("../autenticacao/OperadorCadastro");
const Equipamento_1 = require("../dominio/Equipamento");
const PapelUsuario_1 = require("../enums/PapelUsuario");
/** Fábrica (Factory): concentra a criação de objetos que exigem escolha ou montagem. */
class FabricaObjetos {
    /** Escolhe a subclasse de Usuario de acordo com o papel da credencial. */
    static criarUsuario(credencial) {
        switch (credencial.getPapel()) {
            case PapelUsuario_1.PapelUsuario.ADMINISTRADOR:
                return new Administrador_1.Administrador(credencial);
            case PapelUsuario_1.PapelUsuario.OPERADOR_CADASTRO:
                return new OperadorCadastro_1.OperadorCadastro(credencial);
            case PapelUsuario_1.PapelUsuario.GESTOR_ALMOXARIFADO:
                return new GestorAlmoxarifado_1.GestorAlmoxarifado(credencial);
            case PapelUsuario_1.PapelUsuario.AUDITOR:
                return new Auditor_1.Auditor(credencial);
        }
    }
    /**
     * Cria o equipamento já com a sua movimentação de entrada,
     * garantindo que nenhum equipamento exista sem histórico.
     */
    static criarEquipamento(id, codigoBarras, dados, loteId, posicaoNoLote, responsavel) {
        const equipamento = new Equipamento_1.Equipamento(id, codigoBarras, dados.tipo, dados.marca, dados.modelo, dados.anoFabricacao, dados.estadoFisico, dados.pesoQuilogramas, loteId, posicaoNoLote);
        equipamento.registrarMovimentacao('Almoxarifado', responsavel);
        return equipamento;
    }
}
exports.FabricaObjetos = FabricaObjetos;
