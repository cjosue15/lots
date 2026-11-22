-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "DetailType" AS ENUM ('NONE', 'APPLICATION', 'IRRIGATION', 'PEST_CHECK', 'FERTILIZER_EVAL');

-- CreateTable
CREATE TABLE "Greenhouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Greenhouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "greenhouseId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "detailType" "DetailType" NOT NULL DEFAULT 'NONE',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "CycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "actionId" TEXT,
    "name" TEXT NOT NULL,
    "phaseId" TEXT,
    "date" DATE NOT NULL,
    "details" JSONB,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLogChange" (
    "id" TEXT NOT NULL,
    "actionLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,

    CONSTRAINT "ActionLogChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Greenhouse_name_key" ON "Greenhouse"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_greenhouseId_number_key" ON "Lot"("greenhouseId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_order_key" ON "Phase"("order");

-- CreateIndex
CREATE INDEX "Action_phaseId_idx" ON "Action"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_lotId_number_key" ON "Cycle"("lotId", "number");

-- CreateIndex
CREATE INDEX "ActionLog_cycleId_date_idx" ON "ActionLog"("cycleId", "date");

-- CreateIndex
CREATE INDEX "ActionLogChange_actionLogId_idx" ON "ActionLogChange"("actionLogId");

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_greenhouseId_fkey" FOREIGN KEY ("greenhouseId") REFERENCES "Greenhouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLogChange" ADD CONSTRAINT "ActionLogChange_actionLogId_fkey" FOREIGN KEY ("actionLogId") REFERENCES "ActionLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLogChange" ADD CONSTRAINT "ActionLogChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Cycle_one_active_per_lot" ON "Cycle"("lotId") WHERE "status" = 'ACTIVE';