import { join } from 'path';
import { CLIInterface } from './cli/CLIInterface';
import { Saida } from './cli/Saida';
import { Terminal } from './cli/Terminal';
import { ConfiguracaoMestre } from './persistencia/ConfiguracaoMestre';
import { CriptografiaArquivo } from './persistencia/CriptografiaArquivo';
import { JournalTransacao } from './persistencia/JournalTransacao';
import { RepositorioArquivo } from './persistencia/RepositorioArquivo';
import { ServicoAutenticacao } from './servicos/ServicoAutenticacao';
import { ServicoEquipamento } from './servicos/ServicoEquipamento';
import { ServicoLote } from './servicos/ServicoLote';
import { ServicoOrganizacao } from './servicos/ServicoOrganizacao';
import { ServicoParametros } from './servicos/ServicoParametros';
import { ServicoRelatorio } from './servicos/ServicoRelatorio';
import { ValidadorCNPJ } from './validadores/ValidadorCNPJ';

const DIRETORIO_DADOS = 'dados';
const CAMINHO_MESTRE = join(DIRETORIO_DADOS, 'mestre.json');

async function iniciar(): Promise<void> {
  const terminal = new Terminal(join(DIRETORIO_DADOS, 'historico.txt'));
  const criptografia = new CriptografiaArquivo();
  let configuracao: ConfiguracaoMestre;

  try {
    if (!ConfiguracaoMestre.existe(CAMINHO_MESTRE)) {
      // FR12: primeira execução → modo de provisionamento.
      Saida.aviso('Arquivo de configuração mestre não encontrado. Entrando em modo de provisionamento.');
      const senha = (await terminal.lerSenha('Defina a senha do administrador "admin": ')) ?? '';
      const confirmacao = (await terminal.lerSenha('Confirme a senha: ')) ?? '';
      if (senha !== confirmacao) throw new Error('As senhas não conferem.');
      configuracao = ConfiguracaoMestre.provisionar(CAMINHO_MESTRE, senha, criptografia);
      Saida.sucesso('Sistema provisionado: chave AES-256 gerada e administrador "admin" criado.');
    } else {
      const senha = (await terminal.lerSenha('Senha do administrador para desbloquear o sistema: ')) ?? '';
      configuracao = ConfiguracaoMestre.desbloquear(CAMINHO_MESTRE, senha, criptografia);
      Saida.sucesso('Sistema desbloqueado.');
    }
  } catch (erro) {
    Saida.erro(erro instanceof Error ? erro.message : String(erro));
    terminal.fechar();
    process.exitCode = 1;
    return;
  }

  const chave = configuracao.getChave();
  JournalTransacao.configurar(join(DIRETORIO_DADOS, 'journal.log'), criptografia, chave);
  const repositorio = new RepositorioArquivo(DIRETORIO_DADOS, criptografia, chave);

  const autenticacao = new ServicoAutenticacao(repositorio, configuracao);
  const organizacao = new ServicoOrganizacao(repositorio, new ValidadorCNPJ());
  const lote = new ServicoLote(repositorio);
  const equipamento = new ServicoEquipamento(repositorio);
  const parametros = new ServicoParametros(repositorio);
  const relatorio = new ServicoRelatorio(lote, equipamento, parametros);

  await new CLIInterface(terminal, autenticacao, organizacao, lote, equipamento, relatorio, parametros).iniciarLoop();
}

iniciar();
