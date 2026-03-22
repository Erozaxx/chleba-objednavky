/**
 * app/api/cron/replicate-orders/route.ts
 *
 * GET: Týdenní replikace objednávek (Vercel Cron – pondělí 6:00 UTC).
 *
 * Logika:
 * 1. Zjistí weekStart aktuálního týdne (pondělí)
 * 2. Pro každého aktivního uživatele:
 *    - Pokud skip_until >= weekStart → upsert quantity=0
 *    - Jinak → kopíruje trvalé objednávky z minulého týdne
 * 3. Resetuje dočasné objednávky z minulého týdne
 * 4. Fire-and-forget: spustí emailReminders() BEZ await
 * 5. Naplánuje baking-eve email přes Resend scheduledAt
 *
 * CRON_SECRET ověřuje middleware, ale double-check zde.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users, orders, products, weekSettings } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getWeekStart, formatDateISO, getBakingDate } from '@/lib/week/utils';
import { sendReminder, sendBakingEve, sendSummary } from '@/lib/email/send';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Double-check CRON_SECRET (middleware already validates)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const currentWeekStart = getWeekStart();
    const currentWeekISO = formatDateISO(currentWeekStart);

    // Previous week
    const prevWeekStart = new Date(currentWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekISO = formatDateISO(prevWeekStart);

    // Fetch all active users
    const activeUsers = await db
      .select()
      .from(users)
      .where(eq(users.active, true));

    // Fetch all active products (for skip case – upsert qty=0 for all products)
    const activeProducts = await db
      .select()
      .from(products)
      .where(eq(products.active, true));

    let replicated = 0;

    for (const user of activeUsers) {
      // Check skip_until
      if (user.skipUntil && user.skipUntil >= currentWeekISO) {
        // User is skipping – upsert quantity=0 for all active products
        for (const product of activeProducts) {
          await db
            .insert(orders)
            .values({
              userId: user.id,
              productId: product.id,
              weekStart: currentWeekISO,
              quantity: 0,
              isTemporary: false,
              originalQuantity: null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [orders.userId, orders.productId, orders.weekStart],
              set: {
                quantity: 0,
                isTemporary: false,
                originalQuantity: null,
                updatedAt: new Date(),
              },
            });
        }
        continue;
      }

      // Standard replication: copy permanent orders from previous week
      const prevOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.userId, user.id),
            eq(orders.weekStart, prevWeekISO),
            eq(orders.isTemporary, false),
            sql`${orders.quantity} > 0`,
          ),
        );

      for (const prevOrder of prevOrders) {
        await db
          .insert(orders)
          .values({
            userId: user.id,
            productId: prevOrder.productId,
            weekStart: currentWeekISO,
            quantity: prevOrder.quantity,
            isTemporary: false,
            originalQuantity: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [orders.userId, orders.productId, orders.weekStart],
            // Don't overwrite if customer already modified this week's order
            set: {
              // Only update if the record was auto-created (not manually changed)
              updatedAt: new Date(),
            },
          });

        replicated++;
      }
    }

    // Reset temporary orders from previous week
    const tempOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.weekStart, prevWeekISO),
          eq(orders.isTemporary, true),
        ),
      );

    for (const tempOrder of tempOrders) {
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

    // Fire-and-forget: email reminders + baking-eve scheduling
    // These are started but NOT awaited – response returns immediately after DB ops
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const emailUsers = activeUsers
      .filter((u) => !u.skipUntil || u.skipUntil < currentWeekISO)
      .map((u) => ({ id: u.id, name: u.name, email: u.email }));

    // Fire-and-forget: send reminder emails
    sendReminder(emailUsers, currentWeekISO, origin).catch((err) =>
      console.error('[cron/replicate-orders] Reminder email error:', err),
    );

    // Fire-and-forget: schedule baking-eve emails via Resend scheduledAt
    const [ws] = await db
      .select()
      .from(weekSettings)
      .where(eq(weekSettings.weekStart, currentWeekISO))
      .limit(1);

    const bakingDay = ws?.bakingDay ?? 5;
    const bakingDate = getBakingDate(currentWeekStart, bakingDay);
    // Schedule baking-eve email for the day before baking at 18:00 UTC
    const bakingEveDate = new Date(bakingDate);
    bakingEveDate.setDate(bakingEveDate.getDate() - 1);
    bakingEveDate.setHours(18, 0, 0, 0);

    // Only schedule if baking-eve is in the future
    if (bakingEveDate > new Date()) {
      sendBakingEve(emailUsers, bakingDate, bakingEveDate, origin).catch((err) =>
        console.error('[cron/replicate-orders] Baking-eve email error:', err),
      );
    }

    // Fire-and-forget: send summary to admin
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      // Fetch all orders for this week to build summary
      const weekOrders = await db
        .select({
          userName: users.name,
          productName: products.name,
          quantity: orders.quantity,
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(eq(orders.weekStart, currentWeekISO));

      sendSummary(adminEmail, currentWeekISO, weekOrders).catch((err) =>
        console.error('[cron/replicate-orders] Summary email error:', err),
      );
    }

    return NextResponse.json({
      replicated,
      weekStart: currentWeekISO,
      tempReset: tempOrders.length,
    });
  } catch (error) {
    console.error('[cron/replicate-orders] Error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
