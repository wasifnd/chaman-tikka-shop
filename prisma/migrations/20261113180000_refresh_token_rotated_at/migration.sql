-- When a renewal replaced the token; lets a browser that lost the answer retry briefly.
ALTER TABLE "refresh_tokens" ADD COLUMN "rotated_at" TIMESTAMP(3);
