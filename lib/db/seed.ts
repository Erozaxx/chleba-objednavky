/**
 * lib/db/seed.ts
 *
 * Seed script – vytvoří testovací data v DB.
 *
 * Spuštění:
 *   npx tsx lib/db/seed.ts
 *
 * Předpoklady:
 *   - DATABASE_URL nastavena v prostředí (nebo .env.local)
 *   - Migrace 0001_initial.sql již aplikována
 */

import crypto from 'crypto';
import { db } from './client';
import { users, products, orders, weekSettings } from './schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Vrátí datum pondělí aktuálního týdne ve formátu YYYY-MM-DD.
 * Používáme UTC, aby seed byl deterministický bez ohledu na timezone.
 */
function currentWeekMonday(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = neděle, 1 = pondělí, …
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // posun na pondělí
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff),
  );
  return monday.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  console.log('Seed: start');

  // -- users -----------------------------------------------------------------

  const adminToken = generateToken();
  const customerToken = generateToken();

  const [adminUser] = await db
    .insert(users)
    .values({
      name: 'Admin',
      email: 'admin@example.com',
      token: adminToken,
      active: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { token: adminToken, name: 'Admin', active: true },
    })
    .returning();

  if (!adminUser) {
    throw new Error('Seed: failed to insert admin user');
  }

  console.log(`Seed: admin user created (id=${adminUser.id})`);

  const [customerUser] = await db
    .insert(users)
    .values({
      name: 'Test Zákazník',
      email: 'zakaznik@example.com',
      token: customerToken,
      active: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { token: customerToken, name: 'Test Zákazník', active: true },
    })
    .returning();

  if (!customerUser) {
    throw new Error('Seed: failed to insert customer user');
  }

  console.log(`Seed: customer user created (id=${customerUser.id})`);

  // -- products --------------------------------------------------------------

  // Pravidelné produkty (oneshotVisible: false = default)
  const productDefs = [
    { name: 'Žitný chleba', sortOrder: 1, priceKc: 3500 },
    { name: 'Pšeničný chleba', sortOrder: 2, priceKc: 3200 },
    { name: 'Špaldový chleba', sortOrder: 3, priceKc: 3800 },
  ] as const;

  // Jednorázové produkty (oneshotVisible: true)
  const oneshotProductDefs = [
    { name: 'Celozrnný bagel', sortOrder: 10, priceKc: 1500, description: 'Jednorázová nabídka – celozrnný bagel' },
    { name: 'Škvarkový chléb', sortOrder: 11, priceKc: 4200, description: 'Jednorázová nabídka – škvarkový chléb' },
    { name: 'Rozmarýnová focaccia', sortOrder: 12, priceKc: 2800, description: 'Jednorázová nabídka – focaccia s rozmarýnem' },
  ] as const;

  const insertedProducts = [];

  for (const def of productDefs) {
    // Products have no unique constraint on name – use insert ignoring duplicates by name check.
    // In a fresh seed environment, insert will succeed. Repeated runs are idempotent via
    // the SELECT fallback below.
    const insertResult = await db
      .insert(products)
      .values({ name: def.name, active: true, sortOrder: def.sortOrder, priceKc: def.priceKc, oneshotVisible: false })
      .onConflictDoNothing()
      .returning();

    let product: typeof insertResult[0] | undefined = insertResult[0];

    if (!product) {
      // Row already existed (conflict); fetch it by name
      const rows = await db.select().from(products);
      product = rows.find((p) => p.name === def.name);
    }

    if (!product) {
      throw new Error(`Seed: failed to insert or find product "${def.name}"`);
    }

    insertedProducts.push(product);
    console.log(`Seed: product "${product.name}" created (id=${product.id})`);
  }

  // -- oneshot products ------------------------------------------------------

  for (const def of oneshotProductDefs) {
    const insertResult = await db
      .insert(products)
      .values({
        name: def.name,
        description: def.description,
        active: true,
        sortOrder: def.sortOrder,
        priceKc: def.priceKc,
        oneshotVisible: true,
      })
      .onConflictDoNothing()
      .returning();

    let oneshotProduct: typeof insertResult[0] | undefined = insertResult[0];

    if (!oneshotProduct) {
      // Row already existed (conflict); fetch it by name
      const rows = await db.select().from(products);
      oneshotProduct = rows.find((p) => p.name === def.name);
    }

    if (!oneshotProduct) {
      throw new Error(`Seed: failed to insert or find oneshot product "${def.name}"`);
    }

    console.log(`Seed: oneshot product "${oneshotProduct.name}" created (id=${oneshotProduct.id})`);
  }

  // -- week_settings ---------------------------------------------------------

  const weekStartStr = currentWeekMonday();

  await db
    .insert(weekSettings)
    .values({ weekStart: weekStartStr, bakingDay: 5, closed: false })
    .onConflictDoUpdate({
      target: weekSettings.weekStart,
      set: { bakingDay: 5 },
    });

  console.log(`Seed: week_settings created (week_start=${weekStartStr}, bakingDay=5)`);

  // -- orders ----------------------------------------------------------------

  for (const product of insertedProducts) {
    await db
      .insert(orders)
      .values({
        userId: customerUser.id,
        productId: product.id,
        weekStart: weekStartStr,
        quantity: 1,
        isTemporary: false,
        originalQuantity: null,
      })
      .onConflictDoUpdate({
        target: [orders.userId, orders.productId, orders.weekStart],
        set: { quantity: 1, isTemporary: false, originalQuantity: null, updatedAt: new Date() },
      });

    console.log(`Seed: order created (user=${customerUser.id}, product=${product.id})`);
  }

  console.log('Seed: done');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
