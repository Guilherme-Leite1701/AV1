/**
 * Jornada completa de usuário: do provisionamento inicial até a consulta de
 * rastreabilidade de um equipamento após várias movimentações.
 * Também cobre os cenários de falha exigidos pelas regras de negócio.
 *
 * Executar: npm test
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { after, test } from 'node:test';
import { EstadoFisico } from '../enums/EstadoFisico';
import { PapelUsuario } from '../enums/PapelUsuario';
import { StatusRastreamento } from '../enums/StatusRastreamento';
import { TipoEquipamento } from '../enums/TipoEquipamento';
import { FabricaObjetos } from '../fabricas/FabricaObjetos';
import { ConfiguracaoMestre } from '../persistencia/ConfiguracaoMestre';
import { CriptografiaArquivo } from '../persistencia/CriptografiaArquivo';
import { JournalTransacao } from '../persistencia/JournalTransacao';
import { RepositorioArquivo } from '../persistencia/RepositorioArquivo';
import { ServicoAutenticacao } from '../servicos/ServicoAutenticacao';
import { ServicoEquipamento } from '../servicos/ServicoEquipamento';
import { ServicoLote } from '../servicos/ServicoLote';
import { ServicoOrganizacao } from '../servicos/ServicoOrganizacao';
import { ValidadorCNPJ } from '../validadores/ValidadorCNPJ';

const pasta = mkdtempSync(join(tmpdir(), 'greencode-'));
const caminhoMestre = join(pasta, 'mestre.json');
const criptografia = new CriptografiaArquivo();
after(() => rmSync(pasta, { recursive: true, force: true }));

const CNPJ = '11.222.333/0001-81';
const diasAtras = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

test('jornada completa', () => {
  // 1. Provisionamento: gera a chave e o administrador.
  ConfiguracaoMestre.provisionar(caminhoMestre, 'Admin@2026', criptografia);
  assert.ok(!readFileSync(caminhoMestre, 'utf8').includes('admin'), 'arquivo mestre não pode ter dados em texto');

  // 2. Reinício do sistema: desbloqueio com a senha do administrador.
  assert.throws(() => ConfiguracaoMestre.desbloquear(caminhoMestre, 'senha-errada', criptografia), /incorreta/);
  const configuracao = ConfiguracaoMestre.desbloquear(caminhoMestre, 'Admin@2026', criptografia);
  JournalTransacao.configurar(join(pasta, 'journal.log'), criptografia, configuracao.getChave());
  const repositorio = new RepositorioArquivo(pasta, criptografia, configuracao.getChave());

  const autenticacao = new ServicoAutenticacao(repositorio, configuracao);
  const organizacoes = new ServicoOrganizacao(repositorio, new ValidadorCNPJ());
  const lotes = new ServicoLote(repositorio);
  const equipamentos = new ServicoEquipamento(repositorio);

  // 3. Administrador cria as contas; cada papel vira a subclasse certa.
  const tokenAdmin = autenticacao.login('admin', 'Admin@2026').getToken();
  assert.equal(autenticacao.obterUsuario(tokenAdmin)?.constructor.name, 'Administrador');
  autenticacao.criarUsuario('operador', 'Operador@1', PapelUsuario.OPERADOR_CADASTRO);
  autenticacao.criarUsuario('gestor', 'Gestor@123', PapelUsuario.GESTOR_ALMOXARIFADO);
  autenticacao.criarUsuario('auditor', 'Auditor@12', PapelUsuario.AUDITOR);
  assert.throws(() => autenticacao.criarUsuario('curto', '123', PapelUsuario.AUDITOR), /pelo menos 8/);
  autenticacao.logout(tokenAdmin);

  const auditor = autenticacao.obterUsuario(autenticacao.login('auditor', 'Auditor@12').getToken());
  assert.equal(auditor?.podeExecutar('equip rastrear'), true);
  assert.equal(auditor?.podeExecutar('lote criar'), false, 'auditor é somente leitura');
  assert.throws(() => autenticacao.login('auditor', 'errada'), /inválidos/);

  // 4. Operador cadastra a organização (CNPJ validado e único).
  assert.throws(
    () => organizacoes.cadastrarOrganizacao({ cnpj: '11.222.333/0001-82', razaoSocial: 'X', contrato: {} }),
    /dígitos verificadores/,
  );
  const contrato = { dataAssinatura: diasAtras(30), dataVencimento: new Date(2030, 0, 1), valorMensal: 1500 };
  organizacoes.cadastrarOrganizacao({ cnpj: CNPJ, razaoSocial: 'Banco Exemplo S.A.', enderecoCompleto: 'Rua A, 1', contrato });
  assert.throws(() => organizacoes.cadastrarOrganizacao({ cnpj: CNPJ, razaoSocial: 'Outra', contrato }), /Já existe/);

  // 5. Gestor registra o lote (data de entrada validada).
  const orgId = '11222333000181';
  const base = { organizacaoId: orgId, notaFiscal: '123456', transportadora: 'TransRapida' };
  assert.throws(() => lotes.criarLote({ ...base, dataEntrada: diasAtras(91) }), /90 dias/);
  assert.throws(() => lotes.criarLote({ ...base, dataEntrada: diasAtras(-1) }), /futura/);
  const lote = lotes.criarLote(base);
  assert.equal(lote.getId(), 'LOTE-000001');

  // 6. Equipamento criado pela fábrica já nasce com a movimentação de entrada.
  const sequencia = equipamentos.proximaSequencia();
  const equip = FabricaObjetos.criarEquipamento(
    'EQP-000001',
    equipamentos.gerarCodigoBarras(TipoEquipamento.NOTEBOOK, sequencia),
    {
      tipo: TipoEquipamento.NOTEBOOK, marca: 'Dell', modelo: 'Latitude 5400',
      anoFabricacao: 2019, estadoFisico: EstadoFisico.BOM_ESTADO, pesoQuilogramas: 1.8,
    },
    lote.getId(),
    1,
    'gestor',
  );
  lotes.adicionarEquipamentoLote(lote.getId(), equip);

  // 7. Desmonte antes da triagem completa é bloqueado.
  assert.throws(
    () => equipamentos.atualizarStatus('EQP-000001', StatusRastreamento.AGUARDANDO_DESMONTE, '', 'gestor'),
    /triagem completa/,
  );
  lotes.processarTriagem(lote.getId(), 'gestor');
  assert.throws(
    () => equipamentos.atualizarStatus('EQP-000001', StatusRastreamento.AGUARDANDO_DESMONTE, '', 'gestor'),
    /triagem completa/,
  );
  lotes.concluirTriagem(lote.getId());

  // 8. Queda de duas categorias exige justificativa.
  assert.throws(() => equipamentos.atualizarEstadoFisico('EQP-000001', EstadoFisico.USADO_MODERADO), /justificativa/);
  equipamentos.atualizarEstadoFisico('EQP-000001', EstadoFisico.USADO_MODERADO, 'Carcaça trincada', 'gestor');

  // 9. Mais movimentações e a sequência de desmonte.
  equipamentos.registrarMovimentacao('EQP-000001', 'Bancada de desmonte 2', 'gestor');
  equipamentos.atualizarStatus('EQP-000001', StatusRastreamento.AGUARDANDO_DESMONTE, 'Triagem aprovada', 'gestor');
  equipamentos.atualizarStatus('EQP-000001', StatusRastreamento.EM_DESMONTE, '', 'gestor');

  // 10. Rastreabilidade (pelo código de barras) após várias movimentações.
  const historico = equipamentos.rastrearEquipamento('GC-NTB-000001');
  assert.equal(historico.statusAtual, StatusRastreamento.EM_DESMONTE);
  assert.equal(historico.estadoFisicoAtual, EstadoFisico.USADO_MODERADO);
  assert.equal(historico.movimentacoes.length, 6);
  assert.equal(historico.movimentacoes[0].getDestino(), 'Almoxarifado');

  // 11. Tudo gravado cifrado e registrado no journal.
  for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.dat'))) {
    assert.ok(!readFileSync(join(pasta, arquivo), 'utf8').includes('Dell'), `${arquivo} deve estar cifrado`);
  }
  assert.ok(JournalTransacao.lerUltimas(100).length >= 10);
});

test('rotação do journal ao atingir o tamanho máximo', () => {
  const pastaJournal = mkdtempSync(join(tmpdir(), 'greencode-journal-'));
  const caminho = join(pastaJournal, 'journal.log');
  JournalTransacao.configurar(caminho, criptografia, criptografia.gerarChave());
  const tamanhoOriginal = JournalTransacao.TAMANHO_MAXIMO_BYTES;
  JournalTransacao.TAMANHO_MAXIMO_BYTES = 10;
  try {
    writeFileSync(caminho, 'x'.repeat(20));
    new JournalTransacao('CRIAR', 'teste', null, { id: '1' }, 'teste').registrar();
    const arquivos = readdirSync(pastaJournal);
    assert.equal(arquivos.length, 2, 'deve existir o journal novo e o rotacionado');
    assert.ok(arquivos.some((a) => /^journal-.+\.log$/.test(a)));
  } finally {
    JournalTransacao.TAMANHO_MAXIMO_BYTES = tamanhoOriginal;
    rmSync(pastaJournal, { recursive: true, force: true });
  }
});
