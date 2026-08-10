CREATE TYPE "ScadaDeliveryStatus" AS ENUM ('PENDING', 'RETRYING', 'DELIVERED', 'FAILED');

ALTER TABLE "InspectionResult"
  ADD COLUMN "partNumber" TEXT,
  ADD COLUMN "productFamily" TEXT,
  ADD COLUMN "routeCheckId" TEXT;

CREATE TABLE "ScadaSettings" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "baseUrl" TEXT NOT NULL DEFAULT '',
  "routeCheckPath" TEXT NOT NULL DEFAULT '/api/route-check',
  "submitResultPath" TEXT NOT NULL DEFAULT '/api/inspection-result',
  "publicWebUrl" TEXT NOT NULL DEFAULT 'http://localhost:5173',
  "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "ScadaSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteCheck" (
  "id" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "stationCode" TEXT NOT NULL,
  "processName" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "partNumber" TEXT,
  "productFamily" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScadaDelivery" (
  "id" TEXT NOT NULL,
  "inspectionResultId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "ScadaDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScadaDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InspectionResult_routeCheckId_key" ON "InspectionResult"("routeCheckId");
CREATE INDEX "RouteCheck_serialNumber_idx" ON "RouteCheck"("serialNumber");
CREATE INDEX "RouteCheck_checkedAt_idx" ON "RouteCheck"("checkedAt");
CREATE UNIQUE INDEX "ScadaDelivery_inspectionResultId_key" ON "ScadaDelivery"("inspectionResultId");
CREATE INDEX "ScadaDelivery_status_nextAttemptAt_idx" ON "ScadaDelivery"("status", "nextAttemptAt");

ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_routeCheckId_fkey"
  FOREIGN KEY ("routeCheckId") REFERENCES "RouteCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScadaDelivery" ADD CONSTRAINT "ScadaDelivery_inspectionResultId_fkey"
  FOREIGN KEY ("inspectionResultId") REFERENCES "InspectionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
