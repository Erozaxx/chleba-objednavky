/**
 * app/api/customer/skip-week/route.ts
 *
 * POST: Zákazník přeskočí příští týden (nebo zruší skip).
 * Navrženo BFU agentem: zákazník chce přeskočit týden bez kontaktování admina.
 *
 * Headers: x-user-id (nastaven middlewarem po token lookup)
 * Body: { action: 'skip' | 'cancel', nextWeekStart: string }
 * Response: { success: true, skipUntil: string | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, nextWeekStart } = body;

    if (action !== 'skip' && action !== 'cancel') {
      return NextResponse.json({ error: 'action musí být "skip" nebo "cancel".' }, { status: 400 });
    }

    if (action === 'skip') {
      if (!nextWeekStart || !/^\d{4}-\d{2}-\d{2}$/.test(nextWeekStart)) {
        return NextResponse.json({ error: 'Neplatný formát nextWeekStart.' }, { status: 400 });
      }

      await db
        .update(users)
        .set({ skipUntil: nextWeekStart })
        .where(eq(users.id, userId));

      return NextResponse.json({ success: true, skipUntil: nextWeekStart });
    } else {
      // cancel skip
      await db
        .update(users)
        .set({ skipUntil: null })
        .where(eq(users.id, userId));

      return NextResponse.json({ success: true, skipUntil: null });
    }
  } catch (error) {
    console.error('[api/customer/skip-week] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
