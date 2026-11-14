-- Payments and corrections carry the key the screen sent, so a retried request (a lost reply,
-- a second press) finds the first entry instead of recording the money twice.
ALTER TABLE "khata_entries" ADD COLUMN "request_key" TEXT;

CREATE UNIQUE INDEX "khata_entries_request_key_key" ON "khata_entries"("request_key");
