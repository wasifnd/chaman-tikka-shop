-- Khata: what counter customers owe, by phone number, as an append-only ledger.
-- Counter orders record what was paid at the till and which staff member took them.

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'COUNTER');

-- CreateEnum
CREATE TYPE "KhataEntryKind" AS ENUM ('ORDER', 'PAYMENT', 'CHARGE', 'REDUCTION', 'WRITE_OFF');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'ON_KHATA';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "amount_paid" DECIMAL(10,2),
ADD COLUMN     "placed_by_user_id" UUID,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'ONLINE';

-- CreateTable
CREATE TABLE "khatas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit_limit" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "khatas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khata_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "khata_id" UUID NOT NULL,
    "kind" "KhataEntryKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "order_id" UUID,
    "note" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "khata_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "khatas_phone_key" ON "khatas"("phone");

-- CreateIndex
CREATE INDEX "khatas_balance_idx" ON "khatas"("balance");

-- CreateIndex
CREATE INDEX "khata_entries_khata_id_created_at_idx" ON "khata_entries"("khata_id", "created_at");

-- CreateIndex
CREATE INDEX "khata_entries_order_id_idx" ON "khata_entries"("order_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_user_id_fkey" FOREIGN KEY ("placed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_entries" ADD CONSTRAINT "khata_entries_khata_id_fkey" FOREIGN KEY ("khata_id") REFERENCES "khatas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_entries" ADD CONSTRAINT "khata_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_entries" ADD CONSTRAINT "khata_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The running balance never goes below zero: a payment or reduction larger than what is owed is refused.
ALTER TABLE "khatas" ADD CONSTRAINT "khatas_balance_not_negative" CHECK ("balance" >= 0);
ALTER TABLE "khatas" ADD CONSTRAINT "khatas_credit_limit_not_negative" CHECK ("credit_limit" IS NULL OR "credit_limit" >= 0);
