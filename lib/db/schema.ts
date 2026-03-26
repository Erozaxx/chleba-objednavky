/**
 * lib/db/schema.ts
 *
 * Drizzle ORM schema pro 5 tabulek PostgreSQL.
 * Zdroj pravdy pro TypeScript typy – generuje migrace přes drizzle-kit.
 *
 * Viz architecture_iter-003.md sekce 3 (datový model).
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  date,
  timestamp,
  uniqueIndex,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    token: text('token').notNull().unique(),
    active: boolean('active').notNull().default(true),
    /** NULL = žádný skip; DATE = přeskočit týdny do tohoto data (R-004) */
    skipUntil: date('skip_until'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Explicitní pojmenovaný index na token pro rychlý lookup přes URL
    usersTokenIdx: uniqueIndex('users_token_idx').on(t.token),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  emailLogs: many(emailLogs),
}));

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Cena v haléřích (např. 3500 = 35 Kč). Eliminuje floating-point chyby. */
  priceKc: integer('price_kc').notNull().default(0),
  /** true = produkt se zobrazuje v katalogu jednorázových položek */
  oneshotVisible: boolean('oneshot_visible').notNull().default(false),
});

export const productsRelations = relations(products, ({ many }) => ({
  orders: many(orders),
  oneshotOrders: many(oneshotOrders),
}));

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Vždy pondělí daného týdne */
    weekStart: date('week_start').notNull(),
    quantity: integer('quantity').notNull().default(0),
    /** false = trvalá objednávka; true = dočasná změna na tento týden */
    isTemporary: boolean('is_temporary').notNull().default(false),
    /** NULL pokud není dočasná změna; vyplněno = původní trvalá hodnota */
    originalQuantity: integer('original_quantity'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Aplikační konvence: každý UPDATE musí explicitně předat updatedAt: new Date() */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Upsert klíč – UNIQUE (user_id, product_id, week_start)
    ordersUniqueUserProductWeek: unique('orders_user_product_week_key').on(
      t.userId,
      t.productId,
      t.weekStart,
    ),
    // Index pro dotaz "objednávky uživatele v daném týdnu"
    ordersUserWeekIdx: index('orders_user_week_idx').on(t.userId, t.weekStart),
    // Index pro dotaz "všechny objednávky v týdnu" (AC)
    ordersWeekStartIdx: index('orders_week_start_idx').on(t.weekStart),
    // Note: CHECK constraints (quantity >= 0, original_quantity >= 0) are enforced
    // at the database level via migration SQL (0001_initial.sql), not in Drizzle schema
    // to maintain compatibility with drizzle-orm 0.30.x.
  }),
);

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  product: one(products, { fields: [orders.productId], references: [products.id] }),
}));

// ---------------------------------------------------------------------------
// oneshot_orders
// ---------------------------------------------------------------------------

export const oneshotOrders = pgTable(
  'oneshot_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Nejbližší pondělí pečícího termínu */
    weekStart: date('week_start').notNull(),
    // quantity > 0 CHECK enforced via migration SQL (0002_oneshot_prices.sql)
    // Záměr: nulové oneshot objednávky se mažou (DELETE), nevkládají.
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Aplikační konvence: každý UPDATE musí explicitně předat updatedAt: new Date() */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Upsert klíč – UNIQUE (user_id, product_id, week_start)
    oneshotOrdersUniqueUserProductWeek: unique('oneshot_orders_user_product_week_key').on(
      t.userId,
      t.productId,
      t.weekStart,
    ),
    // Index pro dotaz "oneshot objednávky uživatele v daném týdnu"
    oneshotOrdersUserWeekIdx: index('oneshot_orders_user_week_idx').on(t.userId, t.weekStart),
    // Index pro dotaz "všechny oneshot objednávky v týdnu"
    oneshotOrdersWeekStartIdx: index('oneshot_orders_week_start_idx').on(t.weekStart),
    // Note: CHECK constraint (quantity > 0) is enforced at the database level via
    // migration SQL (0002_oneshot_prices.sql), not in Drizzle schema
    // to maintain compatibility with drizzle-orm 0.30.x.
  }),
);

export const oneshotOrdersRelations = relations(oneshotOrders, ({ one }) => ({
  user: one(users, { fields: [oneshotOrders.userId], references: [users.id] }),
  product: one(products, { fields: [oneshotOrders.productId], references: [products.id] }),
}));

// ---------------------------------------------------------------------------
// week_settings
// ---------------------------------------------------------------------------

export const weekSettings = pgTable(
  'week_settings',
  {
    /** Vždy pondělí – primární klíč */
    weekStart: date('week_start').primaryKey(),
    /** NULL = default (pátek = 5); 1 = pondělí … 7 = neděle */
    bakingDay: integer('baking_day'),
    closed: boolean('closed').notNull().default(false),
    closedReason: text('closed_reason'),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  () => ({
    // Note: CHECK constraint (baking_day BETWEEN 1 AND 7) enforced via migration SQL.
  }),
);

// ---------------------------------------------------------------------------
// email_log
// ---------------------------------------------------------------------------

export const emailLogs = pgTable(
  'email_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** ONBOARDING | REMINDER | BAKING_EVE | SUMMARY | WEEK_CLOSED */
    type: text('type').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    weekStart: date('week_start'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    success: boolean('success').notNull().default(true),
    errorMsg: text('error_msg'),
  },
  (t) => ({
    emailLogSentAtIdx: index('email_log_sent_at_idx').on(t.sentAt),
    // R-009: composite index pro dotaz "byly odeslány emaily daného typu pro tento týden?"
    emailLogTypeWeekIdx: index('email_log_type_week_idx').on(t.type, t.weekStart),
  }),
);

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  user: one(users, { fields: [emailLogs.userId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// Exported types (inference from schema)
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type WeekSettings = typeof weekSettings.$inferSelect;
export type NewWeekSettings = typeof weekSettings.$inferInsert;
export type EmailLog = typeof emailLogs.$inferSelect;
export type NewEmailLog = typeof emailLogs.$inferInsert;
export type OneshotOrder = typeof oneshotOrders.$inferSelect;
export type NewOneshotOrder = typeof oneshotOrders.$inferInsert;
