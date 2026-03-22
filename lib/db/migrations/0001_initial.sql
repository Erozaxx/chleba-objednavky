-- Migration: 0001_initial
-- Generated manually per architecture_iter-003.md sekce 3
-- Pořadí CREATE: users → products → orders (FK závislosti)

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "users" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        TEXT        NOT NULL,
  "email"       TEXT        NOT NULL,
  "token"       TEXT        NOT NULL,
  "active"      BOOLEAN     NOT NULL DEFAULT true,
  "skip_until"  DATE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx"   ON "users" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_token_idx"   ON "users" ("token");

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "products" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "active"      BOOLEAN     NOT NULL DEFAULT true,
  "sort_order"  INTEGER     NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "orders" (
  "id"                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           UUID        NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "product_id"        UUID        NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
  "week_start"        DATE        NOT NULL,
  "quantity"          INTEGER     NOT NULL DEFAULT 0,
  "is_temporary"      BOOLEAN     NOT NULL DEFAULT false,
  "original_quantity" INTEGER,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "orders_quantity_check"           CHECK ("quantity" >= 0),
  CONSTRAINT "orders_original_quantity_check"  CHECK ("original_quantity" IS NULL OR "original_quantity" >= 0),
  CONSTRAINT "orders_user_product_week_key"    UNIQUE ("user_id", "product_id", "week_start")
);

CREATE INDEX IF NOT EXISTS "orders_user_week_idx"   ON "orders" ("user_id", "week_start");
CREATE INDEX IF NOT EXISTS "orders_week_start_idx"  ON "orders" ("week_start");

-- ---------------------------------------------------------------------------
-- week_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "week_settings" (
  "week_start"    DATE        PRIMARY KEY,
  "baking_day"    INTEGER     CHECK ("baking_day" IS NULL OR "baking_day" BETWEEN 1 AND 7),
  "closed"        BOOLEAN     NOT NULL DEFAULT false,
  "closed_reason" TEXT,
  "notified_at"   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- email_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "email_log" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"        TEXT        NOT NULL,
  "user_id"     UUID        REFERENCES "users" ("id") ON DELETE SET NULL,
  "week_start"  DATE,
  "sent_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "success"     BOOLEAN     NOT NULL DEFAULT true,
  "error_msg"   TEXT
);

CREATE INDEX IF NOT EXISTS "email_log_sent_at_idx"    ON "email_log" ("sent_at");
CREATE INDEX IF NOT EXISTS "email_log_type_week_idx"  ON "email_log" ("type", "week_start");
