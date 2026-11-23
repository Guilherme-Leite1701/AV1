-- =============================================================================
-- AV3: camada analítica, API pública (chaves de parceiros) e relatórios
-- assíncronos. Gerada com `prisma migrate diff` e completada à mão com o
-- backfill dos marcos de triagem e as constraints CHECK.
-- =============================================================================

-- CreateEnum
CREATE TYPE "EscopoApi" AS ENUM ('RASTREABILIDADE_LER', 'LOTES_LER', 'LOTES_ESCREVER', 'ANALISES_LER', 'RELATORIOS_GERAR');

-- CreateEnum
CREATE TYPE "TipoAnalise" AS ENUM ('EFICIENCIA_OPERACIONAL', 'RENTABILIDADE', 'VIDA_UTIL');

-- CreateEnum
CREATE TYPE "OrigemExecucao" AS ENUM ('AGENDADA', 'SOB_DEMANDA');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "TipoRelatorioAssincrono" AS ENUM ('PREVISAO_VIDA_UTIL', 'RASTREABILIDADE', 'RENTABILIDADE');

-- CreateEnum
CREATE TYPE "FormatoRelatorio" AS ENUM ('JSON', 'CSV');

-- AlterTable
ALTER TABLE "Lote" ADD COLUMN     "dataConclusaoTriagem" TIMESTAMP(3),
ADD COLUMN     "dataInicioTriagem" TIMESTAMP(3),
ADD COLUMN     "responsavelTriagem" TEXT;

-- CreateTable
CREATE TABLE "ChaveApi" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "hashChave" TEXT NOT NULL,
    "escopos" "EscopoApi"[],
    "organizacaoId" TEXT,
    "limitePorMinuto" INTEGER NOT NULL DEFAULT 60,
    "segredoWebhook" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaPor" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3),
    "ultimoUsoEm" TIMESTAMP(3),
    "revogadaEm" TIMESTAMP(3),
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ChaveApi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecucaoAnalise" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAnalise" NOT NULL,
    "origem" "OrigemExecucao" NOT NULL,
    "solicitante" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "amostras" INTEGER NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL,
    "concluidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duracaoMs" INTEGER NOT NULL,

    CONSTRAINT "ExecucaoAnalise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrevisaoVidaUtil" (
    "id" TEXT NOT NULL,
    "execucaoId" TEXT NOT NULL,
    "tipoEquipamento" "TipoEquipamento" NOT NULL,
    "metodo" TEXT NOT NULL,
    "amostras" INTEGER NOT NULL,
    "coeficienteAngular" DOUBLE PRECISION NOT NULL,
    "intercepto" DOUBLE PRECISION NOT NULL,
    "r2" DOUBLE PRECISION NOT NULL,
    "idadeInservivelAnos" DOUBLE PRECISION,
    "variacaoAnos" DOUBLE PRECISION,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrevisaoVidaUtil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarefaRelatorio" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRelatorioAssincrono" NOT NULL,
    "formato" "FormatoRelatorio" NOT NULL,
    "status" "StatusTarefa" NOT NULL DEFAULT 'PENDENTE',
    "chaveApiId" TEXT,
    "solicitante" TEXT NOT NULL,
    "organizacaoId" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "conteudo" TEXT,
    "nomeArquivo" TEXT,
    "tamanhoBytes" INTEGER,
    "webhookUrl" TEXT,
    "webhookEntregueEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3),

    CONSTRAINT "TarefaRelatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChaveApi_prefixo_key" ON "ChaveApi"("prefixo");

-- CreateIndex
CREATE UNIQUE INDEX "ChaveApi_hashChave_key" ON "ChaveApi"("hashChave");

-- CreateIndex
CREATE INDEX "ChaveApi_organizacaoId_idx" ON "ChaveApi"("organizacaoId");

-- CreateIndex
CREATE INDEX "ExecucaoAnalise_tipo_concluidaEm_idx" ON "ExecucaoAnalise"("tipo", "concluidaEm");

-- CreateIndex
CREATE INDEX "PrevisaoVidaUtil_tipoEquipamento_criadaEm_idx" ON "PrevisaoVidaUtil"("tipoEquipamento", "criadaEm");

-- CreateIndex
CREATE INDEX "TarefaRelatorio_chaveApiId_criadaEm_idx" ON "TarefaRelatorio"("chaveApiId", "criadaEm");

-- CreateIndex
CREATE INDEX "TarefaRelatorio_status_idx" ON "TarefaRelatorio"("status");

-- CreateIndex
CREATE INDEX "Lote_dataConclusaoTriagem_idx" ON "Lote"("dataConclusaoTriagem");

-- AddForeignKey
ALTER TABLE "ChaveApi" ADD CONSTRAINT "ChaveApi_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrevisaoVidaUtil" ADD CONSTRAINT "PrevisaoVidaUtil_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "ExecucaoAnalise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaRelatorio" ADD CONSTRAINT "TarefaRelatorio_chaveApiId_fkey" FOREIGN KEY ("chaveApiId") REFERENCES "ChaveApi"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- Backfill: lotes triados antes da AV3 recebem os marcos a partir do journal
-- (operação TRIAGEM grava o status novo em "dadosDepois").
-- -----------------------------------------------------------------------------
UPDATE "Lote" l
SET "dataInicioTriagem" = j."timestamp",
    "responsavelTriagem" = j."usuarioResponsavel"
FROM "JournalTransacao" j
WHERE j."entidade" = 'Lote'
  AND j."operacao" = 'TRIAGEM'
  AND j."dadosDepois"->>'id' = l."id"
  AND j."dadosDepois"->>'statusProcessamento' = 'EM_TRIAGEM';

UPDATE "Lote" l
SET "dataConclusaoTriagem" = j."timestamp",
    "responsavelTriagem" = COALESCE(l."responsavelTriagem", j."usuarioResponsavel")
FROM "JournalTransacao" j
WHERE j."entidade" = 'Lote'
  AND j."operacao" = 'TRIAGEM'
  AND j."dadosDepois"->>'id' = l."id"
  AND j."dadosDepois"->>'statusProcessamento' = 'TRIAGEM_CONCLUIDA';

-- -----------------------------------------------------------------------------
-- Constraints CHECK (o Prisma ainda não as declara no schema)
-- -----------------------------------------------------------------------------
-- A conclusão da triagem nunca vem antes do início, nem o início antes da entrada.
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_marcos_triagem_check"
  CHECK (
    ("dataInicioTriagem" IS NULL OR "dataInicioTriagem" >= "dataEntrada")
    AND ("dataConclusaoTriagem" IS NULL OR ("dataInicioTriagem" IS NOT NULL AND "dataConclusaoTriagem" >= "dataInicioTriagem"))
  );

-- Toda chave tem pelo menos um escopo e um limite de taxa positivo.
ALTER TABLE "ChaveApi" ADD CONSTRAINT "ChaveApi_escopos_check" CHECK (cardinality("escopos") > 0);
ALTER TABLE "ChaveApi" ADD CONSTRAINT "ChaveApi_limite_check" CHECK ("limitePorMinuto" BETWEEN 1 AND 10000);
ALTER TABLE "ChaveApi" ADD CONSTRAINT "ChaveApi_versao_check" CHECK ("versao" >= 1);

-- Coeficiente de determinação sempre entre 0 e 1.
ALTER TABLE "PrevisaoVidaUtil" ADD CONSTRAINT "PrevisaoVidaUtil_r2_check" CHECK ("r2" >= 0 AND "r2" <= 1);

-- Tarefa concluída sempre tem conteúdo; tentativas nunca negativas.
ALTER TABLE "TarefaRelatorio" ADD CONSTRAINT "TarefaRelatorio_conteudo_check"
  CHECK ("status" <> 'CONCLUIDA' OR "conteudo" IS NOT NULL);
ALTER TABLE "TarefaRelatorio" ADD CONSTRAINT "TarefaRelatorio_tentativas_check" CHECK ("tentativas" >= 0);
