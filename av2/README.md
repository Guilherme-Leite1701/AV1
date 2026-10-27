# greencode — AV2

API REST em camadas para logística reversa de resíduos eletrônicos.
Técnicas de Programação I — FATEC São José dos Campos.

**Stack:** Node.js 20.19+ · TypeScript · Fastify 5 · Prisma 6 · PostgreSQL 16 · JWT · Vitest

Decisões de arquitetura: [ARQUITETURA_AV2.md](ARQUITETURA_AV2.md)

## Como executar

Requer Node.js 20.19+ e Docker.

```bash
npm install
cp .env.example .env        # Windows: Copy-Item .env.example .env
npm run db:up               # PostgreSQL via Docker
npm run db:migrate
npm run db:seed
npm run dev                 # http://localhost:3333
```

| Script | Função |
|---|---|
| `npm test` | Testes unitários |
| `npm run test:integracao` | Testes de integração (com o banco rodando) |
| `npm run build` / `npm start` | Build e execução em produção |
| `npm run db:reset` | Recria o banco e roda o seed |

## Contas do seed

| Usuário | Senha | Papel |
|---|---|---|
| `admin` | `Admin@2026` | ADMINISTRADOR |
| `operador` | `Operador@2026` | OPERADOR_CADASTRO |
| `almoxarife` | `Almox@2026` | GESTOR_ALMOXARIFADO |
| `auditor` | `Auditor@2026` | AUDITOR |

## Endpoints

Exceto `POST /auth/login` e `GET /saude`, todas as rotas exigem `Authorization: Bearer <token>`.
Alterações enviam a `versao` atual do registro (no body, ou na query em `DELETE`).

| Rota | Papéis |
|---|---|
| `POST /auth/login` · `PATCH /auth/senha` | público · autenticado |
| `GET/POST /usuarios` · `GET /parametros` · `PATCH /parametros/:chave` | ADMIN |
| `GET /organizacoes` · `GET /organizacoes/:id` | todos |
| `POST /organizacoes` · `PATCH /organizacoes/:id/endereco` · `DELETE /organizacoes/:id` · `PATCH /organizacoes/:id/contrato/renovar` | ADMIN, OPERADOR |
| `GET /lotes` · `GET /lotes/:id` · `GET /lotes/:id/relatorio-triagem` · `GET /equipamentos/:id/rastreamento` | ADMIN, GESTOR, AUDITOR |
| `POST /lotes` · `POST /lotes/:id/equipamentos` · `DELETE /lotes/:id/equipamentos/:equipId` · `POST /lotes/:id/triagem` | ADMIN, GESTOR |
| `PATCH /equipamentos/:id/estado-fisico` · `PATCH /equipamentos/:id/status` · `POST /equipamentos/:id/movimentacoes` | ADMIN, GESTOR |
| `GET /relatorios/organizacao/:id` · `GET /relatorios/status/:status` · `GET /relatorios/financeiro` · `GET /journal` | ADMIN, AUDITOR |

Erros seguem o formato `{ statusCode, erro, mensagem }`: 400 entrada inválida · 401 não autenticado · 403 sem permissão · 404 não encontrado · 409 duplicidade ou versão desatualizada · 422 regra de negócio.

## Estrutura

```
prisma/        schema, migrations e seed
src/domain/    entidades, regras e validadores
src/repositories/  acesso ao banco, transações e optimistic locking
src/services/  casos de uso
src/controllers/ · src/routes/ · src/middlewares/   camada HTTP (JWT, RBAC, erros)
tests/         unit/ e integracao/
```
