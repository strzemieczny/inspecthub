ALTER TABLE "InspectionResult"
ADD COLUMN "originalInspectionId" TEXT;

CREATE INDEX "InspectionResult_originalInspectionId_idx"
ON "InspectionResult"("originalInspectionId");

ALTER TABLE "InspectionResult"
ADD CONSTRAINT "InspectionResult_originalInspectionId_fkey"
FOREIGN KEY ("originalInspectionId") REFERENCES "InspectionResult"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
