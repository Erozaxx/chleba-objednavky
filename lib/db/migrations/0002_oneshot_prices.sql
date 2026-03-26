-- Migration: 0002_oneshot_prices
-- Generated manually per architecture_iter-012.md sekce 1
-- Backward compatible: ALTER ADD COLUMN with DEFAULT, new table creation

-- ---------------------------------------------------------------------------
-- products – přidat price_kc a oneshot_visible
-- ---------------------------------------------------------------------------

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "price_kc"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "oneshot_visible"  BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- oneshot_orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "oneshot_orders" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     UUID        NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "product_id"  UUID        NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
  "week_start"  DATE        NOT NULL,
  "quantity"    INTEGER     NOT NULL DEFAULT 1,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "oneshot_orders_quantity_check"          CHECK ("quantity" > 0),
  CONSTRAINT "oneshot_orders_user_product_week_key"   UNIQUE ("user_id", "product_id", "week_start")
);

CREATE INDEX IF NOT EXISTS "oneshot_orders_user_week_idx"   ON "oneshot_orders" ("user_id", "week_start");
CREATE INDEX IF NOT EXISTS "oneshot_orders_week_start_idx"  ON "oneshot_orders" ("week_start");
