ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User"
ADD COLUMN "externalProvider" TEXT,
ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "User_externalProvider_externalId_key"
ON "User"("externalProvider", "externalId");
