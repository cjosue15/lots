/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `Action` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Action_code_key" ON "Action"("code");
