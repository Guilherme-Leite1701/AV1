"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const CLIInterface_1 = require("./cli/CLIInterface");
const Saida_1 = require("./cli/Saida");
const Terminal_1 = require("./cli/Terminal");
const ConfiguracaoMestre_1 = require("./persistencia/ConfiguracaoMestre");
const CriptografiaArquivo_1 = require("./persistencia/CriptografiaArquivo");
const JournalTransacao_1 = require("./persistencia/JournalTransacao");
const RepositorioArquivo_1 = require("./persistencia/RepositorioArquivo");
const ServicoAutenticacao_1 = require("./servicos/ServicoAutenticacao");
const ServicoEquipamento_1 = require("./servicos/ServicoEquipamento");
const ServicoLote_1 = require("./servicos/ServicoLote");
const ServicoOrganizacao_1 = require("./servicos/ServicoOrganizacao");
const ServicoParametros_1 = require("./servicos/ServicoParametros");
const ServicoRelatorio_1 = require("./servicos/ServicoRelatorio");
const ValidadorCNPJ_1 = require("./validadores/ValidadorCNPJ");
const DIRETORIO_DADOS = 'dados';
const CAMINHO_MESTRE = (0, path_1.join)(DIRETORIO_DADOS, 'mestre.json');
async function iniciar() {
    const terminal = new Terminal_1.Terminal((0, path_1.join)(DIRETORIO_DADOS, 'historico.txt'));
    const criptografia = new CriptografiaArquivo_1.CriptografiaArquivo();
    let configuracao;
    try {
        if (!ConfiguracaoMestre_1.ConfiguracaoMestre.existe(CAMINHO_MESTRE)) {
            // FR12: primeira execução → modo de provisionamento.
            Saida_1.Saida.aviso('Arquivo de configuração mestre não encontrado. Entrando em modo de provisionamento.');
            const senha = (await terminal.lerSenha('Defina a senha do administrador "admin": ')) ?? '';
            const confirmacao = (await terminal.lerSenha('Confirme a senha: ')) ?? '';
            if (senha !== confirmacao)
                throw new Error('As senhas não conferem.');
            configuracao = ConfiguracaoMestre_1.ConfiguracaoMestre.provisionar(CAMINHO_MESTRE, senha, criptografia);
            Saida_1.Saida.sucesso('Sistema provisionado: chave AES-256 gerada e administrador "admin" criado.');
        }
        else {
            const senha = (await terminal.lerSenha('Senha do administrador para desbloquear o sistema: ')) ?? '';
            configuracao = ConfiguracaoMestre_1.ConfiguracaoMestre.desbloquear(CAMINHO_MESTRE, senha, criptografia);
            Saida_1.Saida.sucesso('Sistema desbloqueado.');
        }
    }
    catch (erro) {
        Saida_1.Saida.erro(erro instanceof Error ? erro.message : String(erro));
        terminal.fechar();
        process.exitCode = 1;
        return;
    }
    const chave = configuracao.getChave();
    JournalTransacao_1.JournalTransacao.configurar((0, path_1.join)(DIRETORIO_DADOS, 'journal.log'), criptografia, chave);
    const repositorio = new RepositorioArquivo_1.RepositorioArquivo(DIRETORIO_DADOS, criptografia, chave);
    const autenticacao = new ServicoAutenticacao_1.ServicoAutenticacao(repositorio, configuracao);
    const organizacao = new ServicoOrganizacao_1.ServicoOrganizacao(repositorio, new ValidadorCNPJ_1.ValidadorCNPJ());
    const lote = new ServicoLote_1.ServicoLote(repositorio);
    const equipamento = new ServicoEquipamento_1.ServicoEquipamento(repositorio);
    const parametros = new ServicoParametros_1.ServicoParametros(repositorio);
    const relatorio = new ServicoRelatorio_1.ServicoRelatorio(lote, equipamento, parametros);
    await new CLIInterface_1.CLIInterface(terminal, autenticacao, organizacao, lote, equipamento, relatorio, parametros).iniciarLoop();
}
iniciar();
