CREATE SCHEMA IF NOT EXISTS "public";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'OPERATOR',
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Form" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "allowedStatuses" JSONB NOT NULL,
  "questions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Process" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Station" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ipAddress" TEXT,
  "deviceTokenHash" TEXT,
  "processId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InspectionResult" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "vinOrSerialNumber" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "mesSynced" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_FormProcesses" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_FormProcesses_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Form_code_idx" ON "Form"("code");
CREATE UNIQUE INDEX "Form_code_version_key" ON "Form"("code", "version");
CREATE UNIQUE INDEX "Process_name_key" ON "Process"("name");
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");
CREATE UNIQUE INDEX "Station_ipAddress_key" ON "Station"("ipAddress");
CREATE UNIQUE INDEX "Station_deviceTokenHash_key" ON "Station"("deviceTokenHash");
CREATE INDEX "Station_active_idx" ON "Station"("active");
CREATE INDEX "Station_processId_idx" ON "Station"("processId");
CREATE INDEX "InspectionResult_formId_idx" ON "InspectionResult"("formId");
CREATE INDEX "InspectionResult_operatorId_idx" ON "InspectionResult"("operatorId");
CREATE INDEX "InspectionResult_vinOrSerialNumber_idx" ON "InspectionResult"("vinOrSerialNumber");
CREATE INDEX "InspectionResult_mesSynced_idx" ON "InspectionResult"("mesSynced");
CREATE INDEX "_FormProcesses_B_index" ON "_FormProcesses"("B");

ALTER TABLE "Station" ADD CONSTRAINT "Station_processId_fkey"
  FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "_FormProcesses" ADD CONSTRAINT "_FormProcesses_A_fkey"
  FOREIGN KEY ("A") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_FormProcesses" ADD CONSTRAINT "_FormProcesses_B_fkey"
  FOREIGN KEY ("B") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;
