/**
 * app/api/admin/products/[id]/route.ts
 *
 * PATCH: update produktu (název, popis, active, sortOrder)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { products } from '@/lib/db/schema';
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
        return NextResponse.json({ error: 'Název nesmí být prázdný.' }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Active musí být boolean.' }, { status: 400 });
      }
      updateData.active = body.active;
    }

    if (body.sortOrder !== undefined) {
      if (typeof body.sortOrder !== 'number') {
        return NextResponse.json({ error: 'SortOrder musí být číslo.' }, { status: 400 });
      }
      updateData.sortOrder = body.sortOrder;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Žádná data k aktualizaci.' }, { status: 400 });
    }

    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Produkt nenalezen.' }, { status: 404 });
    }

    return NextResponse.json({
      product: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        active: updated.active,
        sortOrder: updated.sortOrder,
      },
    });
  } catch (error) {
    console.error('[api/admin/products/[id]] PATCH error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
