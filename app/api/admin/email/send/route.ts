/**
 * app/api/admin/email/send/route.ts
 *
 * POST: Ad-hoc odeslání emailu (onboarding) zákazníkovi.
 * Body: { userId: string, type: "onboarding" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendOnboarding } from '@/lib/email/send';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { userId, type } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId je povinný.' }, { status: 400 });
    }

    if (type !== 'onboarding') {
      return NextResponse.json(
        { error: 'Nepodporovaný typ emailu. Podporované: onboarding' },
        { status: 400 },
      );
    }

    // Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'Uživatel nenalezen.' }, { status: 404 });
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'Uživatel nemá nastavený email, nelze odeslat.' },
        { status: 400 },
      );
    }

    // Build order URL
    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const orderUrl = `${origin}/u/${user.token}`;

    const result = await sendOnboarding(
      { id: user.id, name: user.name, email: user.email },
      orderUrl,
    );

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Onboarding email odeslán.' });
    } else {
      return NextResponse.json(
        { error: result.error || 'Nepodařilo se odeslat email.' },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('[api/admin/email/send] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
