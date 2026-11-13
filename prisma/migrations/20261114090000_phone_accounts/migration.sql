-- Phone numbers become how people sign in; email becomes optional.

-- One stored form for every number (03XXXXXXXXX), so "+923001234567" and "03001234567" are the same.
UPDATE "customers" SET "phone" = '0' || substring("phone" from 4) WHERE "phone" LIKE '+92%';
UPDATE "orders" SET "guest_phone" = '0' || substring("guest_phone" from 4) WHERE "guest_phone" LIKE '+92%';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phone_verified_at" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL;

-- Existing customers keep the number they gave at sign-up, when no one else gave the same one.
-- It is not marked verified: they prove it the first time they order.
UPDATE "users" AS u
SET "phone" = c."phone"
FROM "customers" AS c
WHERE c."user_id" = u."id"
  AND c."phone" IS NOT NULL
  AND c."phone" IN (
    SELECT "phone" FROM "customers" WHERE "phone" IS NOT NULL GROUP BY "phone" HAVING count(*) = 1
  );

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "phone";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "phone_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "phone_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_verifications_phone_code_idx" ON "phone_verifications"("phone", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "orders_guest_phone_idx" ON "orders"("guest_phone");
