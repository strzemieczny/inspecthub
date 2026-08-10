ALTER TABLE "InspectionResult"
ADD COLUMN "clientSubmissionId" TEXT;

CREATE UNIQUE INDEX "InspectionResult_clientSubmissionId_key"
ON "InspectionResult"("clientSubmissionId");
