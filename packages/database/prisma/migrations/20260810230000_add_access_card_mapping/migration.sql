CREATE TABLE "AccessCardMapping" (
  "id" TEXT NOT NULL,
  "uidHash" TEXT NOT NULL,
  "apacsCardNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessCardMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessCardMapping_uidHash_key" ON "AccessCardMapping"("uidHash");
CREATE UNIQUE INDEX "AccessCardMapping_apacsCardNumber_key" ON "AccessCardMapping"("apacsCardNumber");
