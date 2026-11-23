"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicoAutenticacao = void 0;
const Credencial_1 = require("../autenticacao/Credencial");
const FabricaObjetos_1 = require("../fabricas/FabricaObjetos");
const arquivos_1 = require("../persistencia/arquivos");
/**
 * Login, sessões e contas de acesso (FR01, FR10).
 * O administrador inicial fica no arquivo mestre; os demais usuários
 * ficam em "credenciais.dat", separado e cifrado.
 */
class ServicoAutenticacao {
    credenciais;
    sessoesAtivas = [];
    usuariosLogados = new Map(); // token → usuário
    repositorio;
    configuracao;
    constructor(repositorio, configuracao) {
        this.repositorio = repositorio;
        this.configuracao = configuracao;
        this.credenciais = this.carregarCredenciais();
    }
    login(usuario, senha) {
        const credencial = this.credenciais.find((c) => c.getUsuario() === usuario);
        const conta = credencial ? FabricaObjetos_1.FabricaObjetos.criarUsuario(credencial) : null;
        // Mesma mensagem nos dois casos, para não revelar quais usuários existem.
        if (!conta || !conta.autenticar(usuario, senha)) {
            throw new Error('Usuário ou senha inválidos.');
        }
        const sessao = conta.getSessao();
        this.sessoesAtivas.push(sessao);
        this.usuariosLogados.set(sessao.getToken(), conta);
        this.repositorio.definirUsuario(usuario);
        return sessao;
    }
    logout(token) {
        this.sessoesAtivas = this.sessoesAtivas.filter((s) => s.getToken() !== token);
        this.usuariosLogados.delete(token);
        this.repositorio.definirUsuario('sistema');
    }
    /** Verifica se o token existe e não expirou; sessões expiradas são encerradas. */
    validarToken(token) {
        const sessao = this.sessoesAtivas.find((s) => s.getToken() === token);
        if (!sessao)
            return false;
        if (!sessao.isValida()) {
            this.logout(token);
            return false;
        }
        return true;
    }
    /** Devolve o usuário (Administrador, Auditor...) dono de uma sessão válida. */
    obterUsuario(token) {
        return this.validarToken(token) ? (this.usuariosLogados.get(token) ?? null) : null;
    }
    alterarSenha(usuario, senhaAntiga, senhaNova) {
        const atual = this.credenciais.find((c) => c.getUsuario() === usuario);
        if (!atual || !atual.verificarSenha(senhaAntiga))
            return false;
        if (usuario === this.configuracao.getAdministrador().getUsuario()) {
            this.configuracao.alterarSenhaAdministrador(senhaNova);
        }
        else {
            this.salvarCredencial(Credencial_1.Credencial.criar(usuario, senhaNova, atual.getPapel()));
        }
        this.credenciais = this.carregarCredenciais();
        return true;
    }
    /** Cadastro de novas contas (exclusivo do Administrador, controlado pela CLI). */
    criarUsuario(usuario, senha, papel) {
        if (this.credenciais.some((c) => c.getUsuario() === usuario)) {
            throw new Error(`O usuário "${usuario}" já existe.`);
        }
        this.salvarCredencial(Credencial_1.Credencial.criar(usuario, senha, papel));
        this.credenciais = this.carregarCredenciais();
    }
    listarUsuarios() {
        return this.credenciais.map((c) => ({ usuario: c.getUsuario(), papel: c.getPapel() }));
    }
    carregarCredenciais() {
        const demais = this.repositorio.listarEntidades(arquivos_1.ARQUIVOS.CREDENCIAIS).map((d) => Credencial_1.Credencial.reconstruir(d));
        return [this.configuracao.getAdministrador(), ...demais];
    }
    salvarCredencial(credencial) {
        // O repositório identifica registros por "id"; aqui o id é o nome do usuário.
        this.repositorio.salvarEntidade(arquivos_1.ARQUIVOS.CREDENCIAIS, {
            id: credencial.getUsuario(),
            ...JSON.parse(JSON.stringify(credencial)),
        });
    }
}
exports.ServicoAutenticacao = ServicoAutenticacao;
