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
import { sql } from 'drizzle-orm';

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

    // Upsert all order items
    for (const item of orderItems) {
      if (item.quantity === 0) continue; // přeskočit nulové položky
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
    }

    return NextResponse.json({ success: true, saved: orderItems.filter(i => i.quantity > 0).length });
  } catch (error) {
    console.error('[api/admin/users/[id]/orders] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
