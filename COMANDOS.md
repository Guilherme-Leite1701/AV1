# greencode — Guia de Comandos e Tutorial

## Como ler este guia

- Formato geral: `<entidade> <ação> [identificador] [--opção valor]`
- Textos com espaço vão entre aspas: `--obs "caixa aberta"`
- Datas no formato `aaaa-mm-dd`, por exemplo `2026-09-23`
- **Tab** completa os comandos; **↑ / ↓** percorrem o histórico, que é mantido entre sessões
- As senhas são pedidas depois do comando e não aparecem na tela
- Cada resposta vem marcada com o seu nível: `[SUCESSO]`, `[INFO]`, `[AVISO]` ou `[ERRO]`

---

## 1. Lista de comandos

### Comandos gerais (qualquer usuário)

| Comando | O que faz |
|---|---|
| `login <usuario>` | Entra no sistema (a senha é pedida em seguida) |
| `menu` ou `ajuda` | Mostra os comandos permitidos para o seu papel |
| `senha alterar` | Altera a sua senha |
| `logout` | Encerra a sessão |
| `sair` | Fecha o programa |

> A sessão expira após **30 minutos sem atividade**.

### Administrador

| Comando | O que faz |
|---|---|
| `usuario criar --nome <usuario> --papel <PAPEL>` | Cria uma conta. Papéis: `ADMINISTRADOR`, `OPERADOR_CADASTRO`, `GESTOR_ALMOXARIFADO`, `AUDITOR` |
| `usuario listar` | Lista as contas |
| `param listar` | Mostra a alíquota de imposto e o coeficiente de depreciação |
| `param definir [--aliquota 0.18] [--depreciacao 0.2]` | Altera os parâmetros globais (valores de 0 a 1) |
| `org listar` | Lista as organizações ativas |
| `rel financeiro --de <data> --ate <data>` | Resumo de depreciação do período |

### Operador de cadastro

| Comando | O que faz |
|---|---|
| `org cadastrar --cnpj <cnpj> --razao "<razão social>" --endereco "<endereço>" --assinatura <data> --vencimento <data> --valor <valor mensal>` | Cadastra a organização e o contrato. Opcionais: `--ie`, `--tel`, `--email`, `--clausulas "cláusula 1;cláusula 2"`, `--renovacao-auto` |
| `org listar` | Lista as organizações ativas |
| `org buscar <cnpj>` | Mostra os dados e o contrato |
| `org endereco <cnpj> --endereco "<novo endereço>"` | Altera o endereço |
| `org desativar <cnpj>` | Desativa a organização |
| `contrato renovar <cnpj> --vencimento <data>` | Renova o contrato |

### Gestor de almoxarifado

| Comando | O que faz |
|---|---|
| `lote criar --org <cnpj> --nf <nota fiscal> --transp <transportadora>` | Registra a entrada de um lote. Opcionais: `--data <data>` (padrão: hoje) e `--obs "<texto>"` |
| `lote listar [--de <data>] [--ate <data>]` | Lista os lotes |
| `lote triagem <loteId>` | Inicia a triagem (`RECEBIDO` → `EM_TRIAGEM`) |
| `lote concluir <loteId>` | Conclui a triagem (`EM_TRIAGEM` → `TRIAGEM_CONCLUIDA`) |
| `lote relatorio <loteId>` | Relatório de triagem do lote |
| `equip adicionar --lote <loteId> --tipo <TIPO> --marca <marca> --modelo "<modelo>" --ano <ano> --estado <ESTADO> --peso <kg>` | Registra o equipamento e gera o código de barras |
| `equip status <id> --status <STATUS> [--just "<texto>"]` | Altera o status de rastreamento |
| `equip estado <id> --estado <ESTADO> [--just "<texto>"]` | Altera o estado físico |
| `equip mover <id> --destino "<local>"` | Registra uma movimentação física |
| `equip rastrear <id ou código de barras>` | Histórico completo do equipamento |

### Auditor (somente leitura)

| Comando | O que faz |
|---|---|
| `org listar` / `org buscar <cnpj>` | Consulta organizações |
| `lote listar` / `lote relatorio <loteId>` | Consulta lotes |
| `equip rastrear <id ou código de barras>` | Rastreabilidade do equipamento |
| `rel organizacao <cnpj> --de <data> --ate <data>` | Lotes de uma organização no período |
| `rel status <STATUS>` | Equipamentos em um status |
| `rel financeiro --de <data> --ate <data>` | Resumo de depreciação |
| `log listar [--ultimos 20]` | Últimas transações do journal |

### Valores aceitos

| Campo | Valores |
|---|---|
| `--tipo` | `COMPUTADOR_MESA`, `NOTEBOOK`, `MONITOR`, `IMPRESSORA`, `SERVIDOR`, `ROTEADOR`, `CABO_ESTRUTURADO`, `FONTE_ALIMENTACAO` |
| `--estado` (do melhor para o pior) | `NOVO`, `BOM_ESTADO`, `USADO_LEVE`, `USADO_MODERADO`, `DANIFICADO_LEVE`, `DANIFICADO_GRAVE`, `INSERVIVEL` |
| `--status` | `AGUARDANDO_TRIAGEM`, `EM_TRIAGEM`, `AGUARDANDO_DESMONTE`, `EM_DESMONTE`, `PECAS_REAPROVEITADAS`, `MATERIAL_RECICLAVEL`, `DESCARTE_SEGURO`, `BAIXA_DEFINITIVA` |

Letras maiúsculas e minúsculas são aceitas (`notebook` = `NOTEBOOK`).

---

## 2. Tutorial — roteiro de apresentação

Este roteiro percorre o sistema do zero até a rastreabilidade de um equipamento e mostra as regras de negócio em ação. Os passos marcados com ❌ são **erros propositais**, para demonstrar as validações.

### Passo 0 — Preparação

```bash
npm install
npm run build
```

Para começar a apresentação do zero, apague a pasta `dados/`, caso ela exista.

### Passo 1 — Provisionamento (primeira execução)

```bash
npm start
```

```
[AVISO] Arquivo de configuração mestre não encontrado. Entrando em modo de provisionamento.
Defina a senha do administrador "admin": ********
Confirme a senha: ********
[SUCESSO] Sistema provisionado: chave AES-256 gerada e administrador "admin" criado.
```

💡 **Destaque:** a chave de criptografia foi gerada automaticamente e `dados/mestre.json` está cifrado.

### Passo 2 — Administrador cria a equipe

```
login admin
usuario criar --nome operador --papel OPERADOR_CADASTRO
usuario criar --nome gestor --papel GESTOR_ALMOXARIFADO
usuario criar --nome auditor --papel AUDITOR
usuario listar
param definir --depreciacao 0.2 --aliquota 0.18
param listar
lote criar --org 11222333000181 --nf 1 --transp X      ❌ Acesso negado
logout
```

💡 **Destaque:** o menu mostra apenas os comandos do papel, que também são os únicos sugeridos pelo Tab. Isso é o polimorfismo de `permissoes()` em ação.

### Passo 3 — Operador cadastra a organização

```
login operador
org cadastrar --cnpj 11.222.333/0001-82 --razao "Teste" --endereco "Rua X" --assinatura 2026-01-10 --vencimento 2027-01-10 --valor 100      ❌ Dígitos verificadores não conferem
org cadastrar --cnpj 11.222.333/0001-81 --razao "Banco Exemplo S.A." --endereco "Av. Paulista, 1000 - São Paulo/SP" --assinatura 2026-01-10 --vencimento 2027-01-10 --valor 1500 --email contato@exemplo.com.br
org cadastrar --cnpj 11.222.333/0001-81 --razao "Duplicada" --endereco "Rua Y" --assinatura 2026-01-10 --vencimento 2027-01-10 --valor 100      ❌ CNPJ já existe
org buscar 11222333000181
logout
```

### Passo 4 — Gestor recebe o lote e registra os equipamentos

```
login gestor
lote criar --org 11222333000181 --nf 123456 --transp TransRapida --data 2020-01-01      ❌ Mais de 90 dias
lote criar --org 11222333000181 --nf 123456 --transp TransRapida --obs "Troca de parque de TI"
equip adicionar --lote LOTE-000001 --tipo NOTEBOOK --marca Dell --modelo "Latitude 5400" --ano 2019 --estado BOM_ESTADO --peso 1.8
equip adicionar --lote LOTE-000001 --tipo MONITOR --marca LG --modelo "24MK430H" --ano 2020 --estado USADO_LEVE --peso 3.2
lote relatorio LOTE-000001
```

💡 **Destaque:** cada equipamento recebe um código de barras (`GC-NTB-000001`, `GC-MON-000002`) e já nasce com a movimentação de entrada, criada pela **Fábrica**.

### Passo 5 — Triagem e regras de negócio

```
equip status EQP-000001 --status AGUARDANDO_DESMONTE      ❌ Só após a triagem completa
lote triagem LOTE-000001
lote concluir LOTE-000001
equip estado EQP-000001 --estado USADO_MODERADO      ❌ Queda de 2 categorias exige justificativa
equip estado EQP-000001 --estado USADO_MODERADO --just "Carcaça trincada na dobradiça"
equip mover GC-NTB-000001 --destino "Bancada de desmonte 2"
equip status EQP-000001 --status AGUARDANDO_DESMONTE --just "Triagem aprovada"
equip status EQP-000001 --status EM_DESMONTE
equip rastrear GC-NTB-000001
logout
```

💡 **Destaque:** `equip rastrear` mostra a trilha completa: quem fez, quando, de onde para onde e por quê.

### Passo 6 — Auditor consulta e audita

```
login auditor
equip adicionar --lote LOTE-000001 --tipo ROTEADOR --marca X --modelo Y --ano 2020 --estado NOVO --peso 1      ❌ Somente leitura
rel status EM_DESMONTE
rel organizacao 11222333000181 --de 2026-01-01 --ate 2026-12-31
rel financeiro --de 2026-01-01 --ate 2026-12-31
log listar --ultimos 10
sair
```

💡 **Destaque:** `log listar` mostra o journal, em que cada alteração ficou registrada antes de ser aplicada, com o usuário responsável.

### Passo 7 — Segurança dos arquivos

Abra a pasta `dados/` e mostre:

- `lotes.dat`, `organizacoes.dat` e `credenciais.dat` são texto ilegível (AES-256-GCM);
- `historico.txt` guarda os comandos, mas **nenhuma senha**.

Em seguida, reinicie o programa e digite uma senha errada:

```
npm start
Senha do administrador para desbloquear o sistema: ********
[ERRO] Senha do administrador incorreta ou arquivo mestre corrompido.
```

### Passo 8 — Testes automatizados

```bash
npm test
```

Executa a jornada completa e os cenários de falha. O resultado esperado é `pass 2`, `fail 0`.

---

## 3. Dúvidas comuns

| Situação | O que fazer |
|---|---|
| Esqueci a senha do `admin` | Sem ela, o arquivo mestre não abre. Isso é intencional: em ambiente de testes, apague a pasta `dados/` e provisione novamente. |
| `[AVISO] Sessão expirada` | Mais de 30 minutos sem atividade; faça `login` de novo. |
| `[ERRO] Acesso negado para o seu perfil` | O comando não pertence ao seu papel; veja com `menu`. |
| Data rejeitada | Use `aaaa-mm-dd`, com a data entre hoje e 90 dias atrás. |
