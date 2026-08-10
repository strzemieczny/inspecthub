-- UUID v4 provides a non-sequential, cryptographically random public lookup key.
-- The column is introduced as nullable so existing rows can be backfilled safely.
ALTER TABLE "InspectionResult" ADD COLUMN "publicReportId" TEXT;

UPDATE "InspectionResult"
SET "publicReportId" = gen_random_uuid()::text
WHERE "publicReportId" IS NULL;

ALTER TABLE "InspectionResult" ALTER COLUMN "publicReportId" SET NOT NULL;
CREATE UNIQUE INDEX "InspectionResult_publicReportId_key"
  ON "InspectionResult"("publicReportId");
