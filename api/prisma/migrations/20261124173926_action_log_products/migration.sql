-- CreateEnum
CREATE TYPE "DoseUnit" AS ENUM ('MG', 'ML');

-- CreateEnum
CREATE TYPE "ApplicationMethod" AS ENUM ('SYSTEM', 'SPRAY');

-- CreateTable
CREATE TABLE "ActionLogProduct" (
    "id" TEXT NOT NULL,
    "actionLogId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "product" TEXT NOT NULL,
    "dose" DOUBLE PRECISION,
    "doseUnit" "DoseUnit",
    "method" "ApplicationMethod",

    CONSTRAINT "ActionLogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionLogProduct_actionLogId_idx" ON "ActionLogProduct"("actionLogId");

-- AddForeignKey
ALTER TABLE "ActionLogProduct" ADD CONSTRAINT "ActionLogProduct_actionLogId_fkey" FOREIGN KEY ("actionLogId") REFERENCES "ActionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
