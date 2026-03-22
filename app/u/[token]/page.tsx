/**
 * app/u/[token]/page.tsx
 *
 * Server Component: zákaznická stránka.
 * Přečte X-User-Id z headers (nastaven middlewarem).
 * Načte uživatele, produkty a objednávky pro aktuální týden z DB.
 * Pokud isBeforeCutoff: formulář editovatelný; jinak read-only.
 * Renderuje <OrderForm> Client Component.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { users, products, orders, weekSettings } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getWeekStart, isBeforeCutoff, formatDateISO, formatDateCZ, getBakingDate } from '@/lib/week/utils';
import OrderForm from '@/components/customer/OrderForm';
import type { Product, ExistingOrder } from '@/components/customer/OrderForm';

export default async function CustomerPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const headersList = headers();
  const userId = headersList.get('x-user-id');

  if (!userId) {
    redirect('/not-found');
  }

  // Fetch user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.active) {
    redirect('/not-found');
  }

  // Current week
  const weekStart = getWeekStart();
  const weekStartISO = formatDateISO(weekStart);

  // Fetch week settings for current week (if any)
  const [ws] = await db
    .select()
    .from(weekSettings)
    .where(eq(weekSettings.weekStart, weekStartISO))
    .limit(1);

  const bakingDay = ws?.bakingDay ?? 5; // default Friday
  const isClosed = ws?.closed ?? false;

  // Check if before cutoff
  const editable = !isClosed && isBeforeCutoff(weekStart, bakingDay);

  // Baking date for deadline info
  const bakingDate = getBakingDate(weekStart, bakingDay);
  const deadlineInfo = isClosed
    ? 'Tento týden je uzavřen pro objednávky.'
    : editable
      ? `Objednávky lze měnit do ${formatDateCZ(bakingDate)} 17:00.`
      : `Uzávěrka proběhla ${formatDateCZ(bakingDate)} 17:00 – objednávky jsou uzamčeny.`;

  // Fetch active products
  const activeProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.sortOrder), asc(products.name));

  const productData: Product[] = activeProducts.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
  }));

  // Fetch existing orders for this user and week
  const existingOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.weekStart, weekStartISO),
      ),
    );

  const orderData: ExistingOrder[] = existingOrders.map((o) => ({
    productId: o.productId,
    quantity: o.quantity,
    isTemporary: o.isTemporary,
    originalQuantity: o.originalQuantity,
  }));

  return (
    <main className="min-h-screen bg-dough-100 px-4 py-6 sm:py-10">
      <div className="max-w-md mx-auto">
        <OrderForm
          products={productData}
          existingOrders={orderData}
          weekStart={weekStartISO}
          isEditable={editable}
          deadlineInfo={deadlineInfo}
          userName={user.name}
          customerToken={token}
        />
      </div>
    </main>
  );
}
