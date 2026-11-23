"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Jornada completa de usuário: do provisionamento inicial até a consulta de
 * rastreabilidade de um equipamento após várias movimentações.
 * Também cobre os cenários de falha exigidos pelas regras de negócio.
 *
 * Executar: npm test
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const node_test_1 = require("node:test");
const EstadoFisico_1 = require("../enums/EstadoFisico");
const PapelUsuario_1 = require("../enums/PapelUsuario");
const StatusRastreamento_1 = require("../enums/StatusRastreamento");
const TipoEquipamento_1 = require("../enums/TipoEquipamento");
const FabricaObjetos_1 = require("../fabricas/FabricaObjetos");
const ConfiguracaoMestre_1 = require("../persistencia/ConfiguracaoMestre");
const CriptografiaArquivo_1 = require("../persistencia/CriptografiaArquivo");
const JournalTransacao_1 = require("../persistencia/JournalTransacao");
const RepositorioArquivo_1 = require("../persistencia/RepositorioArquivo");
const ServicoAutenticacao_1 = require("../servicos/ServicoAutenticacao");
const ServicoEquipamento_1 = require("../servicos/ServicoEquipamento");
const ServicoLote_1 = require("../servicos/ServicoLote");
const ServicoOrganizacao_1 = require("../servicos/ServicoOrganizacao");
const ValidadorCNPJ_1 = require("../validadores/ValidadorCNPJ");
const pasta = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'greencode-'));
const caminhoMestre = (0, path_1.join)(pasta, 'mestre.json');
const criptografia = new CriptografiaArquivo_1.CriptografiaArquivo();
(0, node_test_1.after)(() => (0, fs_1.rmSync)(pasta, { recursive: true, force: true }));
const CNPJ = '11.222.333/0001-81';
const diasAtras = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
};
(0, node_test_1.test)('jornada completa', () => {
    // 1. Provisionamento: gera a chave e o administrador.
    ConfiguracaoMestre_1.ConfiguracaoMestre.provisionar(caminhoMestre, 'Admin@2026', criptografia);
    strict_1.default.ok(!(0, fs_1.readFileSync)(caminhoMestre, 'utf8').includes('admin'), 'arquivo mestre não pode ter dados em texto');
    // 2. Reinício do sistema: desbloqueio com a senha do administrador.
    strict_1.default.throws(() => ConfiguracaoMestre_1.ConfiguracaoMestre.desbloquear(caminhoMestre, 'senha-errada', criptografia), /incorreta/);
    const configuracao = ConfiguracaoMestre_1.ConfiguracaoMestre.desbloquear(caminhoMestre, 'Admin@2026', criptografia);
    JournalTransacao_1.JournalTransacao.configurar((0, path_1.join)(pasta, 'journal.log'), criptografia, configuracao.getChave());
    const repositorio = new RepositorioArquivo_1.RepositorioArquivo(pasta, criptografia, configuracao.getChave());
    const autenticacao = new ServicoAutenticacao_1.ServicoAutenticacao(repositorio, configuracao);
    const organizacoes = new ServicoOrganizacao_1.ServicoOrganizacao(repositorio, new ValidadorCNPJ_1.ValidadorCNPJ());
    const lotes = new ServicoLote_1.ServicoLote(repositorio);
    const equipamentos = new ServicoEquipamento_1.ServicoEquipamento(repositorio);
    // 3. Administrador cria as contas; cada papel vira a subclasse certa.
    const tokenAdmin = autenticacao.login('admin', 'Admin@2026').getToken();
    strict_1.default.equal(autenticacao.obterUsuario(tokenAdmin)?.constructor.name, 'Administrador');
    autenticacao.criarUsuario('operador', 'Operador@1', PapelUsuario_1.PapelUsuario.OPERADOR_CADASTRO);
    autenticacao.criarUsuario('gestor', 'Gestor@123', PapelUsuario_1.PapelUsuario.GESTOR_ALMOXARIFADO);
    autenticacao.criarUsuario('auditor', 'Auditor@12', PapelUsuario_1.PapelUsuario.AUDITOR);
    strict_1.default.throws(() => autenticacao.criarUsuario('curto', '123', PapelUsuario_1.PapelUsuario.AUDITOR), /pelo menos 8/);
    autenticacao.logout(tokenAdmin);
    const auditor = autenticacao.obterUsuario(autenticacao.login('auditor', 'Auditor@12').getToken());
    strict_1.default.equal(auditor?.podeExecutar('equip rastrear'), true);
    strict_1.default.equal(auditor?.podeExecutar('lote criar'), false, 'auditor é somente leitura');
    strict_1.default.throws(() => autenticacao.login('auditor', 'errada'), /inválidos/);
    // 4. Operador cadastra a organização (CNPJ validado e único).
    strict_1.default.throws(() => organizacoes.cadastrarOrganizacao({ cnpj: '11.222.333/0001-82', razaoSocial: 'X', contrato: {} }), /dígitos verificadores/);
    const contrato = { dataAssinatura: diasAtras(30), dataVencimento: new Date(2030, 0, 1), valorMensal: 1500 };
    organizacoes.cadastrarOrganizacao({ cnpj: CNPJ, razaoSocial: 'Banco Exemplo S.A.', enderecoCompleto: 'Rua A, 1', contrato });
    strict_1.default.throws(() => organizacoes.cadastrarOrganizacao({ cnpj: CNPJ, razaoSocial: 'Outra', contrato }), /Já existe/);
    // 5. Gestor registra o lote (data de entrada validada).
    const orgId = '11222333000181';
    const base = { organizacaoId: orgId, notaFiscal: '123456', transportadora: 'TransRapida' };
    strict_1.default.throws(() => lotes.criarLote({ ...base, dataEntrada: diasAtras(91) }), /90 dias/);
    strict_1.default.throws(() => lotes.criarLote({ ...base, dataEntrada: diasAtras(-1) }), /futura/);
    const lote = lotes.criarLote(base);
    strict_1.default.equal(lote.getId(), 'LOTE-000001');
    // 6. Equipamento criado pela fábrica já nasce com a movimentação de entrada.
    const sequencia = equipamentos.proximaSequencia();
    const equip = FabricaObjetos_1.FabricaObjetos.criarEquipamento('EQP-000001', equipamentos.gerarCodigoBarras(TipoEquipamento_1.TipoEquipamento.NOTEBOOK, sequencia), {
        tipo: TipoEquipamento_1.TipoEquipamento.NOTEBOOK, marca: 'Dell', modelo: 'Latitude 5400',
        anoFabricacao: 2019, estadoFisico: EstadoFisico_1.EstadoFisico.BOM_ESTADO, pesoQuilogramas: 1.8,
    }, lote.getId(), 1, 'gestor');
    lotes.adicionarEquipamentoLote(lote.getId(), equip);
    // 7. Desmonte antes da triagem completa é bloqueado.
    strict_1.default.throws(() => equipamentos.atualizarStatus('EQP-000001', StatusRastreamento_1.StatusRastreamento.AGUARDANDO_DESMONTE, '', 'gestor'), /triagem completa/);
    lotes.processarTriagem(lote.getId(), 'gestor');
    strict_1.default.throws(() => equipamentos.atualizarStatus('EQP-000001', StatusRastreamento_1.StatusRastreamento.AGUARDANDO_DESMONTE, '', 'gestor'), /triagem completa/);
    lotes.concluirTriagem(lote.getId());
    // 8. Queda de duas categorias exige justificativa.
    strict_1.default.throws(() => equipamentos.atualizarEstadoFisico('EQP-000001', EstadoFisico_1.EstadoFisico.USADO_MODERADO), /justificativa/);
    equipamentos.atualizarEstadoFisico('EQP-000001', EstadoFisico_1.EstadoFisico.USADO_MODERADO, 'Carcaça trincada', 'gestor');
    // 9. Mais movimentações e a sequência de desmonte.
    equipamentos.registrarMovimentacao('EQP-000001', 'Bancada de desmonte 2', 'gestor');
    equipamentos.atualizarStatus('EQP-000001', StatusRastreamento_1.StatusRastreamento.AGUARDANDO_DESMONTE, 'Triagem aprovada', 'gestor');
    equipamentos.atualizarStatus('EQP-000001', StatusRastreamento_1.StatusRastreamento.EM_DESMONTE, '', 'gestor');
    // 10. Rastreabilidade (pelo código de barras) após várias movimentações.
    const historico = equipamentos.rastrearEquipamento('GC-NTB-000001');
    strict_1.default.equal(historico.statusAtual, StatusRastreamento_1.StatusRastreamento.EM_DESMONTE);
    strict_1.default.equal(historico.estadoFisicoAtual, EstadoFisico_1.EstadoFisico.USADO_MODERADO);
    strict_1.default.equal(historico.movimentacoes.length, 6);
    strict_1.default.equal(historico.movimentacoes[0].getDestino(), 'Almoxarifado');
    // 11. Tudo gravado cifrado e registrado no journal.
    for (const arquivo of (0, fs_1.readdirSync)(pasta).filter((a) => a.endsWith('.dat'))) {
        strict_1.default.ok(!(0, fs_1.readFileSync)((0, path_1.join)(pasta, arquivo), 'utf8').includes('Dell'), `${arquivo} deve estar cifrado`);
    }
    strict_1.default.ok(JournalTransacao_1.JournalTransacao.lerUltimas(100).length >= 10);
});
(0, node_test_1.test)('rotação do journal ao atingir o tamanho máximo', () => {
    const pastaJournal = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'greencode-journal-'));
    const caminho = (0, path_1.join)(pastaJournal, 'journal.log');
    JournalTransacao_1.JournalTransacao.configurar(caminho, criptografia, criptografia.gerarChave());
    const tamanhoOriginal = JournalTransacao_1.JournalTransacao.TAMANHO_MAXIMO_BYTES;
    JournalTransacao_1.JournalTransacao.TAMANHO_MAXIMO_BYTES = 10;
    try {
        (0, fs_1.writeFileSync)(caminho, 'x'.repeat(20));
        new JournalTransacao_1.JournalTransacao('CRIAR', 'teste', null, { id: '1' }, 'teste').registrar();
        const arquivos = (0, fs_1.readdirSync)(pastaJournal);
        strict_1.default.equal(arquivos.length, 2, 'deve existir o journal novo e o rotacionado');
        strict_1.default.ok(arquivos.some((a) => /^journal-.+\.log$/.test(a)));
    }
    finally {
        JournalTransacao_1.JournalTransacao.TAMANHO_MAXIMO_BYTES = tamanhoOriginal;
        (0, fs_1.rmSync)(pastaJournal, { recursive: true, force: true });
    }
});
