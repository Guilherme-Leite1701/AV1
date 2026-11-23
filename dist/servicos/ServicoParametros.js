"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicoParametros = void 0;
const Equipamento_1 = require("../dominio/Equipamento");
const arquivos_1 = require("../persistencia/arquivos");
/** Parâmetros globais do sistema, configurados pelo Administrador (FR10). */
class ServicoParametros {
    static ID = 'parametros';
    static PADRAO = {
        aliquotaImposto: 0,
        coeficienteDepreciacao: Equipamento_1.Equipamento.COEFICIENTE_PADRAO,
    };
    repositorio;
    constructor(repositorio) {
        this.repositorio = repositorio;
    }
    obter() {
        const salvo = this.repositorio.carregarEntidade(arquivos_1.ARQUIVOS.PARAMETROS, ServicoParametros.ID);
        return {
            aliquotaImposto: salvo?.aliquotaImposto ?? ServicoParametros.PADRAO.aliquotaImposto,
            coeficienteDepreciacao: salvo?.coeficienteDepreciacao ?? ServicoParametros.PADRAO.coeficienteDepreciacao,
        };
    }
    definir(novos) {
        for (const [nome, valor] of Object.entries(novos)) {
            if (valor !== undefined && (!Number.isFinite(valor) || valor < 0 || valor > 1)) {
                throw new Error(`O parâmetro ${nome} deve estar entre 0 e 1.`);
            }
        }
        const atualizados = { ...this.obter(), ...novos };
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.PARAMETROS, { id: ServicoParametros.ID, ...atualizados });
    }
}
exports.ServicoParametros = ServicoParametros;
