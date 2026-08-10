/*
  Warnings:

  - The primary key for the `AuditEvent` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "InspectionResult" DROP CONSTRAINT "InspectionResult_operatorId_fkey";

-- AlterTable
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
