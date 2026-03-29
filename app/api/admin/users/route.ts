/**
 * app/api/admin/users/route.ts
 *
 * GET: seznam všech zákazníků
 * POST: vytvoření nového zákazníka (generuje token pomocí crypto.randomBytes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';

export async function GET(): Promise<NextResponse> {
  try {
    const allUsers = await db
      .select()
      .from(users)
      .orderBy(asc(users.name));

    return NextResponse.json({
      users: allUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        token: u.token,
        active: u.active,
        skipUntil: u.skipUntil,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[api/admin/users] GET error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name, email, phone } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Jméno je povinné.' }, { status: 400 });
    }

    const emailValue = email && typeof email === 'string' && email.trim() ? email.trim() : null;
    const phoneValue = phone && typeof phone === 'string' && phone.trim() ? phone.trim() : null;

    // Generate 32-byte hex token (256 bits entropy)
    const token = randomBytes(32).toString('hex');

    const [newUser] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: emailValue,
        phone: phoneValue,
        token,
      })
      .returning();

    return NextResponse.json({
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        token: newUser.token,
        active: newUser.active,
        skipUntil: newUser.skipUntil,
        createdAt: newUser.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error('[api/admin/users] POST error:', error);
    // Handle unique constraint violation on email
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json({ error: 'Email je již registrován.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
