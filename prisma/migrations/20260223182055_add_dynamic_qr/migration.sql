-- CreateTable
CREATE TABLE "QRCode" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QRCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QRCode_shortCode_key" ON "QRCode"("shortCode");
