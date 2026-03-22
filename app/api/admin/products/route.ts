/**
 * app/api/admin/products/route.ts
 *
 * GET: seznam všech produktů
 * POST: vytvoření nového produktu
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { products } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';

export async function GET(): Promise<NextResponse> {
  try {
    const allProducts = await db
      .select()
      .from(products)
      .orderBy(asc(products.sortOrder), asc(products.name));

    return NextResponse.json({
      products: allProducts.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        active: p.active,
        sortOrder: p.sortOrder,
      })),
    });
  } catch (error) {
    console.error('[api/admin/products] GET error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Název produktu je povinný.' }, { status: 400 });
    }

    const [newProduct] = await db
      .insert(products)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
      })
      .returning();

    return NextResponse.json({
      product: {
        id: newProduct.id,
        name: newProduct.name,
        description: newProduct.description,
        active: newProduct.active,
        sortOrder: newProduct.sortOrder,
      },
    });
  } catch (error) {
    console.error('[api/admin/products] POST error:', error);
    return NextResponse.json({ error: 'Interní chyba serveru.' }, { status: 500 });
  }
}
