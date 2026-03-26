/**
 * app/api/customer/oneshot-orders/route.ts
 *
 * POST: Upsert jednorázové objednávky (qty >= 1).
 * DELETE: Smazání jednorázové objednávky (idempotentní – pokud neexistuje → 200).
 *
 * Auth: x-customer-token header → middleware → x-user-id header (stejný vzor jako /api/customer/orders)
 *
 * POST Body:  { productId: string, weekStart: string, quantity: number }
 * DELETE Body:{ productId: string, weekStart: string }
 * Response:   { success: true } | { error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { oneshotOrders, products } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helpers – weekStart validace
// ---------------------------------------------------------------------------

/** Ověří, že řetězec má formát YYYY-MM-DD a je platné datum. */
function isValidDateFormat(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

/** Ověří, že datum je pondělí (getUTCDay() === 1). */
function isMonday(s: string): boolean {
  const d = new Date(s + 'T00:00:00Z');
  return d.getUTCDay() === 1;
}

/** Vrátí aktuální pondělí v UTC (začátek týdne). */
function getStartOfCurrentWeekUTC(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = neděle, 1 = pondělí...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return monday;
}

/** Vrátí datum N týdnů od daného data. */
function addWeeksUTC(base: Date, weeks: number): Date {
  return new Date(base.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

/**
 * Validuje weekStart: formát ISO, pondělí, ne v minulosti, max +8 týdnů.
 * Vrátí null pokud je vše v pořádku, jinak chybový string.
 */
function validateWeekStart(weekStart: string): string | null {
  if (!isValidDateFormat(weekStart)) return 'invalid_week_start';
  if (!isMonday(weekStart)) return 'invalid_week_start';

  const candidate = new Date(weekStart + 'T00:00:00Z');
  const currentMonday = getStartOfCurrentWeekUTC();
  if (candidate < currentMonday) return 'invalid_week_start';

  const maxWeekStart = addWeeksUTC(currentMonday, 8);
  if (candidate > maxWeekStart) return 'invalid_week_start';

  return null;
}

// ---------------------------------------------------------------------------
// POST – upsert jednorázové objednávky
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { productId, weekStart, quantity } = body;

    // Validace vstupů
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'Chybí productId.' }, { status: 400 });
    }
    if (!weekStart || typeof weekStart !== 'string') {
      return NextResponse.json({ error: 'Chybí weekStart.' }, { status: 400 });
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'Quantity musí být celé číslo >= 1.' }, { status: 400 });
    }

    // Validace weekStart
    const weekStartError = validateWeekStart(weekStart);
    if (weekStartError) {
      return NextResponse.json({ error: weekStartError }, { status: 400 });
    }

    // Ověření, že produkt existuje a je oneshotVisible = true
    const [product] = await db
      .select({ id: products.id, oneshotVisible: products.oneshotVisible, active: products.active })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      return NextResponse.json({ error: 'Produkt nenalezen.' }, { status: 404 });
    }
    if (!product.oneshotVisible || !product.active) {
      return NextResponse.json({ error: 'Produkt není dostupný pro jednorázové objednávky.' }, { status: 400 });
    }

    // Upsert
    await db
      .insert(oneshotOrders)
      .values({
        userId,
        productId,
        weekStart,
        quantity,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [oneshotOrders.userId, oneshotOrders.productId, oneshotOrders.weekStart],
        set: {
          quantity: sql`excluded.quantity`,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/customer/oneshot-orders] POST Error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE – smazání jednorázové objednávky (idempotentní)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { productId, weekStart } = body;

    // Validace vstupů
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'Chybí productId.' }, { status: 400 });
    }
    if (!weekStart || typeof weekStart !== 'string') {
      return NextResponse.json({ error: 'Chybí weekStart.' }, { status: 400 });
    }

    // Smazání záznamu – idempotentní (pokud neexistuje, nic se nestane)
    await db
      .delete(oneshotOrders)
      .where(
        and(
          eq(oneshotOrders.userId, userId),
          eq(oneshotOrders.productId, productId),
          eq(oneshotOrders.weekStart, weekStart),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/customer/oneshot-orders] DELETE Error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
