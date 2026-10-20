ALTER TABLE "Station" ADD COLUMN "mobileDeviceId" TEXT,
ADD COLUMN "mobileDeviceTokenHash" TEXT,
ADD COLUMN "mobileLastSeenAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Station_mobileDeviceId_key" ON "Station"("mobileDeviceId");
CREATE UNIQUE INDEX "Station_mobileDeviceTokenHash_key" ON "Station"("mobileDeviceTokenHash");
