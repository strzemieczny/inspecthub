ALTER TABLE "InspectionResult"
ADD COLUMN "durationSeconds" INTEGER,
ADD COLUMN "answerCorrections" INTEGER NOT NULL DEFAULT 0;
