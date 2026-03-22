/**
 * app/api/admin/weeks/[weekStart]/route.ts
 *
 * PATCH: update nastavení konkrétního týdne (zavřít/otevřít)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { weekSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteParams {
  params: { weekStart: string };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { weekStart } = params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.closed !== undefined) {
      updateData.closed = body.closed;
    }

    if (body.closedReason !== undefined) {
      updateData.closedReason = body.closedReason;
    }

    if (body.bakingDay !== undefined) {
      if (typeof body.bakingDay !== 'number' || body.bakingDay < 1 || body.bakingDay > 7) {
        return NextResponse.json(
          { error: 'bakingDay musí být číslo 1-7.' },
          { status: 400 },
        );
      }
      updateData.bakingDay = body.bakingDay;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Žádná data k aktualizaci.' }, { status: 400 });
    }

    // Try update first; if row doesn't exist, upsert
    const [existing] = await db
      .select()
      .from(weekSettings)
      .where(eq(weekSettings.weekStart, weekStart))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(weekSettings)
        .set(updateData)
        .where(eq(weekSettings.weekStart, weekStart))
        .returning();

      return NextResponse.json({
        week: {
          weekStart: updated.weekStart,
          bakingDay: updated.bakingDay,
          closed: updated.closed,
          closedReason: updated.closedReason,
        },
      });
    } else {
      // Create new week settings
      const [created] = await db
        .insert(weekSettings)
        .values({
          weekStart,
          ...updateData,
        } as typeof weekSettings.$inferInsert)
        .returning();

      return NextResponse.json({
        week: {
          weekStart: created.weekStart,
          bakingDay: created.bakingDay,
          closed: created.closed,
          closedReason: created.closedReason,
        },
      });
    }
  } catch (error) {
    console.error('[api/admin/weeks/[weekStart]] PATCH error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
