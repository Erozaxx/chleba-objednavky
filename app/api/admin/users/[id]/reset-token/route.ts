/**
 * app/api/admin/users/[id]/reset-token/route.ts
 *
 * POST: generuje nový token pro zákazníka.
 * Starý token je okamžitě neplatný.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteParams {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = params;

    // Generate new 32-byte hex token
    const newToken = randomBytes(32).toString('hex');

    const [updated] = await db
      .update(users)
      .set({ token: newToken })
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Uživatel nenalezen.' }, { status: 404 });
    }

    // Build new URL
    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const newUrl = `${origin}/u/${newToken}`;

    return NextResponse.json({
      newToken,
      newUrl,
    });
  } catch (error) {
    console.error('[api/admin/users/[id]/reset-token] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
