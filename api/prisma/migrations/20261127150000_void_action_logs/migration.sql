-- AlterTable
ALTER TABLE "ActionLog" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;
-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
