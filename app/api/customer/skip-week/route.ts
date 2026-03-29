/**
 * app/api/customer/skip-week/route.ts
 *
 * POST: Zákazník přeskočí příští 1 nebo 2 týdny (nebo zruší skip).
 * Navrženo BFU agentem: zákazník chce přeskočit týden bez kontaktování admina.
 *
 * Headers: x-user-id (nastaven middlewarem po token lookup)
 * Body (skip):   { action: 'skip', nextWeekStart: string, weeksCount?: 1 | 2 }
 * Body (cancel): { action: 'cancel', nextWeekStart: string }
 * Response: { success: true, skipUntil: string | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, orders } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { parseISO, getNextWeekStart, getWeekStart, formatDateISO } from '@/lib/week/utils';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, nextWeekStart, weeksCount } = body;

    if (action !== 'skip' && action !== 'cancel') {
      return NextResponse.json({ error: 'action musí být "skip" nebo "cancel".' }, { status: 400 });
    }

    if (action === 'skip') {
      if (!nextWeekStart || !/^\d{4}-\d{2}-\d{2}$/.test(nextWeekStart)) {
        return NextResponse.json({ error: 'Neplatný formát nextWeekStart.' }, { status: 400 });
      }

      // S-001: validace dne v týdnu – nextWeekStart musí být pondělí
      const parsedDate = parseISO(nextWeekStart);
      if (parsedDate.getDay() !== 1) {
        return NextResponse.json({ error: 'nextWeekStart musí být pondělí.' }, { status: 400 });
      }

      // weeksCount: 1 | 2, default = 1
      const weeks: 1 | 2 = weeksCount === 2 ? 2 : 1;
      const skipUntil =
        weeks === 2
          ? formatDateISO(getNextWeekStart(parsedDate, 1))
          : nextWeekStart;

      await db
        .update(users)
        .set({ skipUntil })
        .where(eq(users.id, userId));

      // If skipping the current calendar week (after cron already ran),
      // immediately zero out the user's existing orders for that week.
      const currentCalWeekISO = formatDateISO(getWeekStart(new Date()));
      if (nextWeekStart <= currentCalWeekISO) {
        const existing = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.userId, userId),
              eq(orders.weekStart, nextWeekStart),
              sql`${orders.quantity} > 0`,
            ),
          );
        for (const order of existing) {
          await db
            .update(orders)
            .set({
              quantity: 0,
              isTemporary: true,
              originalQuantity: order.isTemporary ? order.originalQuantity : order.quantity,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));
        }
      }

      return NextResponse.json({ success: true, skipUntil });
    } else {
      // cancel skip
      await db
        .update(users)
        .set({ skipUntil: null })
        .where(eq(users.id, userId));

      // If canceling skip for current week, restore temporarily zeroed orders
      const currentCalWeekISO = formatDateISO(getWeekStart(new Date()));
      if (nextWeekStart && nextWeekStart <= currentCalWeekISO) {
        const zeroedOrders = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.userId, userId),
              eq(orders.weekStart, nextWeekStart),
              eq(orders.isTemporary, true),
              sql`${orders.quantity} = 0`,
            ),
          );
        for (const order of zeroedOrders) {
          await db
            .update(orders)
            .set({
              quantity: order.originalQuantity ?? 0,
              isTemporary: false,
              originalQuantity: null,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));
        }
      }

      return NextResponse.json({ success: true, skipUntil: null });
    }
  } catch (error) {
    console.error('[api/customer/skip-week] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
