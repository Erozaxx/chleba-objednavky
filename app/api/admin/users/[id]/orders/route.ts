/**
 * app/api/admin/users/[id]/orders/route.ts
 *
 * POST: Nastavení výchozí pravidelné objednávky pro uživatele (admin onboarding).
 * Upsertuje záznamy do tabulky orders pro zadaný weekStart.
 * Body: { weekStart: string, orders: [{ productId: string, quantity: number }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { orders } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: userId } = params;
    const body = await request.json();

    const { weekStart, orders: orderItems } = body;

    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: 'Neplatný weekStart.' }, { status: 400 });
    }

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return NextResponse.json({ error: 'Pole orders nesmí být prázdné.' }, { status: 400 });
    }

    for (const item of orderItems) {
      if (!item.productId || typeof item.productId !== 'string') {
        return NextResponse.json({ error: 'Chybí productId.' }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity < 0) {
        return NextResponse.json({ error: 'Quantity musí být číslo >= 0.' }, { status: 400 });
      }
    }

    // Upsert or delete order items
    let saved = 0;
    for (const item of orderItems) {
      if (item.quantity === 0) {
        // Smazat existující záznam pokud existuje (odebrání produktu z objednávky)
        await db
          .delete(orders)
          .where(
            and(
              eq(orders.userId, userId),
              eq(orders.productId, item.productId),
              eq(orders.weekStart, weekStart),
            ),
          );
      } else {
        await db
          .insert(orders)
          .values({
            userId,
            productId: item.productId,
            weekStart,
            quantity: item.quantity,
            isTemporary: false,
            originalQuantity: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [orders.userId, orders.productId, orders.weekStart],
            set: {
              quantity: item.quantity,
              isTemporary: false,
              originalQuantity: null,
              updatedAt: new Date(),
            },
          });
        saved++;
      }
    }

    return NextResponse.json({ success: true, saved });
  } catch (error) {
    console.error('[api/admin/users/[id]/orders] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
