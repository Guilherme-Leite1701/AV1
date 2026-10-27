-- =============================================================================
-- Migration customizada: constraints CHECK
--
-- O Prisma ainda não declara CHECK no schema.prisma, então elas ficam aqui,
-- em SQL puro. São a última linha de defesa: mesmo que alguém grave direto no
-- banco (sem passar pela API), o PostgreSQL recusa dados inválidos.
-- =============================================================================

-- Um equipamento sempre tem massa: peso zero ou negativo é erro de digitação.
ALTER TABLE "Equipamento"
  ADD CONSTRAINT "Equipamento_pesoQuilogramas_positivo_check"
  CHECK ("pesoQuilogramas" > 0);

-- Contrato pode ser gratuito (0), mas nunca negativo.
ALTER TABLE "Contrato"
  ADD CONSTRAINT "Contrato_valorMensal_nao_negativo_check"
  CHECK ("valorMensal" >= 0);

-- [Extra] O vencimento precisa vir depois da assinatura (mesma regra da classe Contrato).
ALTER TABLE "Contrato"
  ADD CONSTRAINT "Contrato_vencimento_apos_assinatura_check"
  CHECK ("dataVencimento" > "dataAssinatura");

-- [Extra] O controle de versão (optimistic locking) começa em 1 e só cresce.
ALTER TABLE "Organizacao" ADD CONSTRAINT "Organizacao_versao_check" CHECK ("versao" >= 1);
ALTER TABLE "Contrato"    ADD CONSTRAINT "Contrato_versao_check"    CHECK ("versao" >= 1);
ALTER TABLE "Lote"        ADD CONSTRAINT "Lote_versao_check"        CHECK ("versao" >= 1);
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_versao_check" CHECK ("versao" >= 1);
