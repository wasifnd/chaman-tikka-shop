/*
  Warnings:

  - Added the required column `request_hash` to the `idempotency_keys` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN     "request_hash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "tracking_token" SET DEFAULT gen_random_uuid()::text;
