/**
 * app/api/cron/archive-weeks/route.ts
 *
 * GET: Archivace starých týdnů (Vercel Cron – neděle 4:00 UTC).
 *
 * Logika:
 * 1. Označí týdny starší než 4 týdny jako closed (pokud ještě nejsou)
 * 2. Vyčistí orders s quantity=0 starší než 4 týdny
 * 3. Safety-net: resetuje přehlédnuté dočasné objednávky z týdnů před aktuálním
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { orders, weekSettings } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import { getWeekStart, formatDateISO } from '@/lib/week/utils';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Double-check CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const currentWeekStart = getWeekStart();
    const currentWeekISO = formatDateISO(currentWeekStart);

    // 4 weeks ago
    const fourWeeksAgo = new Date(currentWeekStart);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const fourWeeksAgoISO = formatDateISO(fourWeeksAgo);

    let archived = 0;

    // 1. Auto-close weeks older than 4 weeks (upsert week_settings with closed=true)
    // Find distinct week_start values from orders that are old and not yet closed
    const oldWeekStarts = await db
      .selectDistinct({ weekStart: orders.weekStart })
      .from(orders)
      .where(lt(orders.weekStart, fourWeeksAgoISO));

    for (const { weekStart } of oldWeekStarts) {
      // Check if already closed
      const [existing] = await db
        .select()
        .from(weekSettings)
        .where(eq(weekSettings.weekStart, weekStart))
        .limit(1);

      if (!existing) {
        await db.insert(weekSettings).values({
          weekStart,
          closed: true,
          closedReason: 'Auto-archivováno',
        });
        archived++;
      } else if (!existing.closed) {
        await db
          .update(weekSettings)
          .set({ closed: true, closedReason: 'Auto-archivováno' })
          .where(eq(weekSettings.weekStart, weekStart));
        archived++;
      }
    }

    // 2. Clean up orders with quantity=0 older than 4 weeks
    const deleteResult = await db
      .delete(orders)
      .where(
        and(
          lt(orders.weekStart, fourWeeksAgoISO),
          eq(orders.quantity, 0),
        ),
      )
      .returning({ id: orders.id });

    const cleaned = deleteResult.length;

    // 3. Safety-net: reset forgotten temporary orders from past weeks
    const forgottenTemp = await db
      .select()
      .from(orders)
      .where(
        and(
          lt(orders.weekStart, currentWeekISO),
          eq(orders.isTemporary, true),
        ),
      );

    for (const tempOrder of forgottenTemp) {
      await db
        .update(orders)
        .set({
          quantity: tempOrder.originalQuantity ?? 0,
          isTemporary: false,
          originalQuantity: null,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, tempOrder.id));
    }

    return NextResponse.json({
      archived,
      cleaned,
      tempReset: forgottenTemp.length,
    });
  } catch (error) {
    console.error('[cron/archive-weeks] Error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
