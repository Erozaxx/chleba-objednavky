-- Migration: 0003_optional_email_phone
-- email: drop NOT NULL constraint (zůstává UNIQUE, NULL ≠ NULL v PostgreSQL)
-- phone: přidat volitelný sloupec

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "phone" text;
