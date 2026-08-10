-- Indexes used by quality dashboards and bounded analytics exports.
CREATE INDEX "InspectionResult_createdAt_idx"
ON "InspectionResult"("createdAt");

CREATE INDEX "InspectionResult_stationId_createdAt_idx"
ON "InspectionResult"("stationId", "createdAt");

CREATE INDEX "InspectionResult_formId_createdAt_idx"
ON "InspectionResult"("formId", "createdAt");
