/**
 * app/api/admin/users/[id]/route.ts
 *
 * PATCH: update uživatele (jméno, email, phone, active, skipUntil)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface RouteParams {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'Jméno nesmí být prázdné.' }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.email !== undefined) {
      // null nebo prázdný string = smazat email
      updateData.email =
        body.email && typeof body.email === 'string' && body.email.trim()
          ? body.email.trim()
          : null;
    }

    if (body.phone !== undefined) {
      updateData.phone =
        body.phone && typeof body.phone === 'string' && body.phone.trim()
          ? body.phone.trim()
          : null;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Active musí být boolean.' }, { status: 400 });
      }
      updateData.active = body.active;
    }

    if (body.skipUntil !== undefined) {
      if (body.skipUntil !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.skipUntil)) {
        return NextResponse.json({ error: 'Invalid skipUntil format' }, { status: 400 });
      }
      updateData.skipUntil = body.skipUntil; // null or YYYY-MM-DD date string
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Žádná data k aktualizaci.' }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Uživatel nenalezen.' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        token: updated.token,
        active: updated.active,
        skipUntil: updated.skipUntil,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[api/admin/users/[id]] PATCH error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
