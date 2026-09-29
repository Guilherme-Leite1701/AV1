# greencode — Rastreabilidade de Logística Reversa (CLI)

> Projeto de Programação Orientada a Objetos em TypeScript — Técnicas de Programação I (FATEC SJC)

## 1. Visão geral

O **greencode** controla o ciclo de vida de equipamentos eletrônicos descartados por empresas: registra a chegada dos lotes, faz a triagem e rastreia cada equipamento até o destino final, com um histórico completo de quem fez o quê e quando.

É uma **aplicação de linha de comando (CLI)** sem banco de dados. Os dados ficam em **arquivos cifrados com AES-256**, e toda alteração passa antes por um **journal de transações**.

## 2. Tecnologias

| Item | Escolha |
|---|---|
| Linguagem | TypeScript (modo `strict`) |
| Runtime | Node.js 22 ou superior |
| Criptografia | Módulo nativo `crypto` do Node |
| Interface | Módulo nativo `readline` |
| Testes | Executor nativo `node:test` |
| Plataformas | Windows 10 ou superior; Ubuntu 24.04 ou superior e derivados |

O projeto não depende de nenhuma biblioteca externa para rodar.

## 3. Como executar

```bash
npm install      # instala o TypeScript
npm run build    # compila src/ → dist/
npm test         # executa os testes
npm start        # inicia a CLI
```

- **Primeira execução:** o sistema pede a senha do administrador `admin` e gera a chave de criptografia automaticamente.
- **Execuções seguintes:** o sistema pede a senha do administrador para desbloquear os dados.

A lista de comandos e um tutorial passo a passo estão em **[COMANDOS.md](COMANDOS.md)**.

## 4. Estrutura do projeto

```
src/
├── autenticacao/   Usuários, papéis, credenciais e sessões
├── cli/            Interface de linha de comando
├── dominio/        Organizacao, Contrato, Lote, Equipamento, Movimentacao
├── enums/          Listas de valores fixos (papéis, status, tipos, estados)
├── fabricas/       Criação de objetos (padrão Factory)
├── persistencia/   Arquivos cifrados, journal e configuração mestre
├── servicos/       Regras de negócio de cada área
├── testes/         Teste da jornada completa
├── tipos/          Tipos auxiliares
├── validadores/    Validação de CNPJ e de datas
└── index.ts        Ponto de entrada
dados/              Criada ao executar (fora do git)
```

## 5. Conceitos de orientação a objetos

### 5.1 Usuários e papéis: interface, herança e polimorfismo

- `Autenticavel` é a **interface**: define o contrato de autenticação.
- `Usuario` é a **classe abstrata** que implementa essa interface. Ela concentra o que é comum a todos os usuários: a verificação de senha e a sessão.
- Quatro **subclasses**: `Administrador`, `OperadorCadastro`, `GestorAlmoxarifado` e `Auditor`.

**Polimorfismo:** a CLI sempre faz a mesma pergunta, `usuario.podeExecutar("lote criar")`. A resposta muda conforme a subclasse, porque cada papel implementa `permissoes()` do seu jeito.

### 5.2 Padrão Factory

`FabricaObjetos` centraliza duas criações:

- `criarUsuario(credencial)` escolhe a subclasse certa a partir do papel da credencial;
- `criarEquipamento(...)` cria o equipamento já com a sua movimentação de entrada, de modo que nenhum equipamento existe sem histórico.

### 5.3 Validadores (classe abstrata)

`Validador` define o contrato `validar()` + `obterMensagemErro()`. As subclasses são:

- `ValidadorCNPJ`: confere os dígitos verificadores. Aceita também o CNPJ alfanumérico.
- `ValidadorDataEntrada`: recusa datas futuras e datas com mais de 90 dias.

### 5.4 Identificadores

| Entidade | Formato | Exemplo |
|---|---|---|
| Organização | CNPJ sem máscara | `11222333000181` |
| Lote | Sequencial | `LOTE-000001` |
| Equipamento | Sequencial | `EQP-000001` |
| Código de barras | `GC-<tipo>-<sequência>` | `GC-NTB-000001` |

Os equipamentos e suas movimentações são gravados dentro do respectivo lote.

## 6. Segurança

| Aspecto | Solução |
|---|---|
| Senhas | Hash SHA-256 com *salt* aleatório por usuário; mínimo de 8 caracteres |
| Sessão | Expira após **30 minutos sem atividade** |
| Dados em disco | **AES-256-GCM**, que cifra os dados e detecta adulterações |
| Arquivo mestre | A chave AES e o administrador ficam cifrados com uma chave derivada da senha do `admin` |
| Senhas na CLI | A digitação fica oculta e nunca vai para o histórico |
| Login | A mesma mensagem de erro para usuário inexistente e para senha errada |

> Observação: O SHA-256 é um requisito deste projeto.

## 7. Persistência e journal

- **Gravação atômica:** grava primeiro em um arquivo temporário e depois renomeia. Assim, uma interrupção não corrompe os dados.
- **Journal:** cada alteração (criar, alterar ou excluir) é registrada, com os estados antes e depois e o usuário responsável, **antes** de ser aplicada.
- **Rotação e retenção:** acima de 10 MB, o journal é arquivado; os arquivos antigos são mantidos por pelo menos 180 dias.

Arquivos na pasta `dados/`:

| Arquivo | Conteúdo |
|---|---|
| `mestre.json` | Chave de criptografia e administrador inicial |
| `credenciais.dat` | Demais usuários |
| `parametros.dat` | Alíquota de imposto e coeficiente de depreciação |
| `organizacoes.dat` | Organizações e contratos |
| `lotes.dat` | Lotes, equipamentos e movimentações |
| `journal.log` | Registro de transações |
| `historico.txt` | Histórico de comandos (sem senhas) |

Todos os arquivos são cifrados, exceto `historico.txt`.

## 8. Regras de negócio

| Regra | Onde |
|---|---|
| CNPJ válido e único | `ValidadorCNPJ`, `ServicoOrganizacao` |
| Data de entrada do lote: não futura e até 90 dias atrás | `ValidadorDataEntrada`, `ServicoLote` |
| Lote só para organização existente e ativa | `ServicoLote` |
| Equipamentos só entram em lotes `RECEBIDO` | `ServicoLote` |
| Desmonte só após a triagem concluída do lote | `ServicoEquipamento` |
| Queda de 2 ou mais categorias no estado físico exige justificativa | `Equipamento` |
| Toda mudança de status, estado ou local gera uma `Movimentacao` | `Equipamento` |

Fluxo do lote: `RECEBIDO` → `EM_TRIAGEM` → `TRIAGEM_CONCLUIDA`

## 9. Requisitos atendidos

| Requisito | Implementação |
|---|---|
| FR01 Autenticação por papel | `ServicoAutenticacao`, `Usuario` e subclasses |
| FR02 Organizações + CNPJ | `ServicoOrganizacao`, `ValidadorCNPJ` |
| FR03 Contratos | `Contrato` |
| FR04 Lotes + data de entrada | `ServicoLote`, `ValidadorDataEntrada` |
| FR05 Equipamentos e código de barras | `ServicoEquipamento`, `FabricaObjetos` |
| FR06 Movimentações + justificativa | `Equipamento`, `Movimentacao` |
| FR07 Journal | `JournalTransacao` |
| FR08 Notificações | `Saida` (`[SUCESSO]`, `[INFO]`, `[AVISO]`, `[ERRO]`) |
| FR09 CLI | `CLIInterface`, `Terminal` |
| FR10 Contas e parâmetros globais | `ServicoAutenticacao`, `ServicoParametros` |
| FR11 Relatórios (Auditor) | `ServicoRelatorio` |
| FR12 Modo de provisionamento | `ConfiguracaoMestre`, `index.ts` |

