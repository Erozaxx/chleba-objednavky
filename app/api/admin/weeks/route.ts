/**
 * app/api/admin/weeks/route.ts
 *
 * GET: seznam týdenních nastavení
 * POST: upsert week_settings (vytvoření nebo aktualizace)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { weekSettings } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

export async function GET(): Promise<NextResponse> {
  try {
    const allWeeks = await db
      .select()
      .from(weekSettings)
      .orderBy(desc(weekSettings.weekStart));

    return NextResponse.json({
      weeks: allWeeks.map((w) => ({
        weekStart: w.weekStart,
        bakingDay: w.bakingDay,
        closed: w.closed,
        closedReason: w.closedReason,
        notifiedAt: w.notifiedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error('[api/admin/weeks] GET error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { weekStart, bakingDay, closed, closedReason } = body;

    if (!weekStart || typeof weekStart !== 'string') {
      return NextResponse.json({ error: 'weekStart je povinný.' }, { status: 400 });
    }

    const values: Record<string, unknown> = { weekStart };

    if (bakingDay !== undefined) {
      if (typeof bakingDay !== 'number' || bakingDay < 1 || bakingDay > 7) {
        return NextResponse.json(
          { error: 'bakingDay musí být číslo 1-7.' },
          { status: 400 },
        );
      }
      values.bakingDay = bakingDay;
    }

    if (closed !== undefined) {
      values.closed = closed;
    }

    if (closedReason !== undefined) {
      values.closedReason = closedReason;
    }

    // Upsert: insert or update on conflict with weekStart (primary key)
    const [result] = await db
      .insert(weekSettings)
      .values(values as typeof weekSettings.$inferInsert)
      .onConflictDoUpdate({
        target: weekSettings.weekStart,
        set: {
          ...(bakingDay !== undefined ? { bakingDay: sql`excluded.baking_day` } : {}),
          ...(closed !== undefined ? { closed: sql`excluded.closed` } : {}),
          ...(closedReason !== undefined ? { closedReason: sql`excluded.closed_reason` } : {}),
        },
      })
      .returning();

    return NextResponse.json({
      week: {
        weekStart: result.weekStart,
        bakingDay: result.bakingDay,
        closed: result.closed,
        closedReason: result.closedReason,
      },
    });
  } catch (error) {
    console.error('[api/admin/weeks] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
