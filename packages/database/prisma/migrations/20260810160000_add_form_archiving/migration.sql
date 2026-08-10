ALTER TABLE "Form" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Form_archivedAt_idx" ON "Form"("archivedAt");
