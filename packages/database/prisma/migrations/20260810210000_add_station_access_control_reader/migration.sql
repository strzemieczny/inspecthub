ALTER TABLE "Station" ADD COLUMN "accessControlReaderId" INTEGER;
CREATE UNIQUE INDEX "Station_accessControlReaderId_key" ON "Station"("accessControlReaderId");
