/**
 * app/api/customer/orders/route.ts
 *
 * POST: Uložení objednávek zákazníka.
 * Atomický upsert: INSERT ... ON CONFLICT (user_id, product_id, week_start) DO UPDATE.
 *
 * Headers: X-User-Id (nastaven middlewarem)
 * Body: { orders: [{ productId, weekStart, quantity, isTemporary, originalQuantity }] }
 * Response: { success: true, saved: N } nebo { error: "..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

interface OrderInput {
  productId: string;
  weekStart: string;
  quantity: number;
  isTemporary: boolean;
  originalQuantity: number | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.orders || !Array.isArray(body.orders) || body.orders.length === 0) {
      return NextResponse.json(
        { error: 'Pole orders je povinné a nesmí být prázdné.' },
        { status: 400 },
      );
    }

    // Validate each order item
    for (const item of body.orders as OrderInput[]) {
      if (!item.productId || typeof item.productId !== 'string') {
        return NextResponse.json({ error: 'Chybí productId.' }, { status: 400 });
      }
      if (!item.weekStart || typeof item.weekStart !== 'string') {
        return NextResponse.json({ error: 'Chybí weekStart.' }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity < 0) {
        return NextResponse.json(
          { error: 'Quantity musí být číslo >= 0.' },
          { status: 400 },
        );
      }
      if (typeof item.isTemporary !== 'boolean') {
        return NextResponse.json(
          { error: 'isTemporary musí být boolean.' },
          { status: 400 },
        );
      }
    }

    const orderItems = body.orders as OrderInput[];
    let saved = 0;

    // Atomický upsert pro každou objednávku
    for (const item of orderItems) {
      await db
        .insert(orders)
        .values({
          userId,
          productId: item.productId,
          weekStart: item.weekStart,
          quantity: item.quantity,
          isTemporary: item.isTemporary,
          originalQuantity: item.originalQuantity,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [orders.userId, orders.productId, orders.weekStart],
          set: {
            quantity: sql`excluded.quantity`,
            isTemporary: sql`excluded.is_temporary`,
            originalQuantity: sql`excluded.original_quantity`,
            updatedAt: new Date(),
          },
        });
      saved++;
    }

    return NextResponse.json({ success: true, saved });
  } catch (error) {
    console.error('[api/customer/orders] Error:', error);
    return NextResponse.json(
      { error: 'Interní chyba serveru.' },
      { status: 500 },
    );
  }
}
