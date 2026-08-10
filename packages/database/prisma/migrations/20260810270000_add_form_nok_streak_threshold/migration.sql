ALTER TABLE "Form"
ADD COLUMN "nokStreakThreshold" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "Form"
ADD CONSTRAINT "Form_nokStreakThreshold_check"
CHECK ("nokStreakThreshold" >= 2 AND "nokStreakThreshold" <= 100);
