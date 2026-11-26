/*
  Warnings:

  - You are about to drop the column `minStock` on the `Product` table. All the data in the column will be lost.
  - Added the required column `greenhouseId` to the `StockMovement` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "StockMovement_productId_date_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "minStock";

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "greenhouseId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ProductGreenhouse" (
    "productId" TEXT NOT NULL,
    "greenhouseId" TEXT NOT NULL,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProductGreenhouse_pkey" PRIMARY KEY ("productId","greenhouseId")
);

-- CreateIndex
CREATE INDEX "StockMovement_productId_greenhouseId_date_idx" ON "StockMovement"("productId", "greenhouseId", "date");

-- AddForeignKey
ALTER TABLE "ProductGreenhouse" ADD CONSTRAINT "ProductGreenhouse_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGreenhouse" ADD CONSTRAINT "ProductGreenhouse_greenhouseId_fkey" FOREIGN KEY ("greenhouseId") REFERENCES "Greenhouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_greenhouseId_fkey" FOREIGN KEY ("greenhouseId") REFERENCES "Greenhouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
