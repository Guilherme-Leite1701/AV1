# greencode — AV3

Plataforma analítica e integrada de logística reversa: o monólito da AV2 ganha camada analítica,
API pública para parceiros e relatórios assíncronos.
Técnicas de Programação I — FATEC São José dos Campos.

**Stack:** Node.js 20.19+ · TypeScript · Fastify 5 · Prisma 6 · PostgreSQL 16 · Redis 7 + BullMQ · simple-statistics · Vitest

Relatório técnico com as decisões de arquitetura: `Relatorio_Tecnico_AV3_greencode.pdf`, entregue junto com a atividade.

## Como executar

Requer Node.js 20.19+ e Docker (PostgreSQL + Redis).

```bash
npm install
cp .env.example .env        # Windows: Copy-Item .env.example .env
npm run db:up               # PostgreSQL + Redis via Docker
npm run db:migrate
npm run db:seed             # inclui 12 meses de histórico para as análises
npm run dev                 # http://localhost:3333  ·  Swagger: http://localhost:3333/docs
```

Para usar a fila no Redis, descomente `REDIS_URL` no `.env`. Sem Redis a fila roda em memória,
dentro do servidor (útil para desenvolvimento no Windows sem Docker).

| Script | Função |
|---|---|
| `npm run worker` / `npm run dev:worker` | Worker separado (exige `REDIS_URL`; use com `WORKER_EMBUTIDO=false`) |
| `npm test` | Testes unitários |
| `npm run test:integracao` | Testes de integração (com o banco rodando) |
| `npm run build` / `npm start` / `npm run start:worker` | Build e execução em produção |
| `npm run db:reset` | Recria o banco e roda o seed |

## Contas e chaves do seed (só desenvolvimento)

| Usuário | Senha | Papel |
|---|---|---|
| `admin` | `Admin@2026` | ADMINISTRADOR |
| `operador` | `Operador@2026` | OPERADOR_CADASTRO |
| `almoxarife` · `almoxarife2` · `almoxarife3` | `Almox@2026` · `Almox2@2026` · `Almox3@2026` | GESTOR_ALMOXARIFADO |
| `auditor` | `Auditor@2026` | AUDITOR |

| Chave de API (`X-API-Key`) | Parceiro | Escopos |
|---|---|---|
| `gc_00000001_demoBancoVanguardaTodosOsEscopos00000000000` | Banco Vanguarda | todos |
| `gc_00000002_demoAuditoriaGlobalSomenteLeitura0000000000` | global | `RASTREABILIDADE_LER`, `ANALISES_LER` |

## Endpoints

A versão maior fica na URL (`/api/v1`); a versão completa vem no cabeçalho `api-version` das respostas públicas.

### Pública — `/api/v1/public` (chave no cabeçalho `X-API-Key`)

| Rota | Escopo |
|---|---|
| `GET /status` | — |
| `GET /equipamentos/:codigo/rastreamento` | `RASTREABILIDADE_LER` |
| `GET /lotes` · `GET /lotes/:id` | `LOTES_LER` |
| `POST /lotes` (lote + equipamentos numa transação) | `LOTES_ESCREVER` |
| `GET /analises/rentabilidade` · `GET /analises/vida-util` | `ANALISES_LER` |
| `POST /relatorios` (202) · `GET /relatorios/:id` · `GET /relatorios/:id/download` | `RELATORIOS_GERAR` |

Limite por chave (padrão 60/min, cabeçalhos `x-ratelimit-*`, 429 ao estourar). Uma chave vinculada a uma
organização só enxerga os dados dela (outra organização → 404).

### Administração — `/api/v1/admin` (JWT de ADMINISTRADOR)

`POST/GET /chaves-api` · `DELETE /chaves-api/:id?versao=` · `POST /analises/executar` ·
`GET /tarefas` · `POST /tarefas/:id/reprocessar` · `GET /fila/metricas`

### Interna — `/api/v1/internal` (JWT)

Todas as rotas da AV2 (`/auth/login`, `/organizacoes`, `/lotes`, `/equipamentos`, `/relatorios`, `/journal`...) e:
`GET /analises/{eficiencia|rentabilidade|vida-util}` · `GET /analises/execucoes[/:id]` ·
`GET /analises/vida-util/historico` (ADMINISTRADOR e AUDITOR).

Erros seguem `{ statusCode, erro, mensagem }`: 400 · 401 · 403 · 404 · 409 · 410 relatório expirado · 422 · 429 limite · 503 fila fora do ar.

## Estrutura

```
prisma/              schema, migrations (AV3: 20261123120000_av3_*), seed + seedHistorico
src/domain/analise/  Estatistica (MQO manual), AnalisadorEficiencia, AnalisadorRentabilidade, AnalisadorVidaUtil
src/domain/          ChaveApi, SerializadorRelatorio, enums e erros da AV3
src/filas/           FilaTarefas (porta), FilaBullMQ, FilaMemoria, processadores
src/services/        ServicoAnalise, ServicoChaveApi, ServicoRelatorioAssincrono, ServicoApiPublica
src/routes/          publico, admin, analises (+ as rotas da AV2)
src/server.ts        API (com worker embutido opcional)
src/worker.ts        worker separado
tests/               unit/ e integracao/
```
