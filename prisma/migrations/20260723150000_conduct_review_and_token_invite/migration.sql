-- DropForeignKey
ALTER TABLE "TokenGrant" DROP CONSTRAINT "TokenGrant_recipient_account_id_fkey";

-- AlterTable
ALTER TABLE "AccountFlag" ADD COLUMN     "secondary_reviewed_by" TEXT;

-- AlterTable
ALTER TABLE "TokenGrant" ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "recipient_email" TEXT,
ALTER COLUMN "recipient_account_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TokenGrant" ADD CONSTRAINT "TokenGrant_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountFlag" ADD CONSTRAINT "AccountFlag_secondary_reviewed_by_fkey" FOREIGN KEY ("secondary_reviewed_by") REFERENCES "Account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

