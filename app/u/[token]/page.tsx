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
import { users, products, orders, weekSettings, oneshotOrders } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getWeekStart, isBeforeCutoff, formatDateISO, formatDateCZ, getDeadlineDate, getNextWeekStart } from '@/lib/week/utils';
import CustomerOrderPage from '@/components/customer/CustomerOrderPage';
import type { Product, ExistingOrder } from '@/components/customer/OrderForm';
import type { OneshotProduct, InitialOneshotOrder } from '@/components/customer/OneshotSection';
import SkipWeekButton from '@/components/customer/SkipWeekButton';

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

  // Deadline date = den před pečením v 17:00
  const deadlineDate = getDeadlineDate(weekStart, bakingDay);
  const deadlineInfo = isClosed
    ? 'Tento týden je uzavřen pro objednávky.'
    : editable
      ? `Objednávky lze měnit do ${formatDateCZ(deadlineDate)} 17:00.`
      : `Uzávěrka proběhla ${formatDateCZ(deadlineDate)} 17:00 – objednávky jsou uzamčeny.`;

  // Fetch active products + oneshot products souběžně (Promise.all)
  const [activeProducts, oneshotProductsRaw, existingOrdersRaw, existingOneshotOrdersRaw] =
    await Promise.all([
      // Pravidelné produkty: active=true AND oneshotVisible=false
      db
        .select()
        .from(products)
        .where(and(eq(products.active, true), eq(products.oneshotVisible, false)))
        .orderBy(asc(products.sortOrder), asc(products.name)),
      // Oneshot katalog: active=true + oneshotVisible=true
      db
        .select()
        .from(products)
        .where(and(eq(products.active, true), eq(products.oneshotVisible, true)))
        .orderBy(asc(products.sortOrder), asc(products.name)),
      // Pravidelné objednávky uživatele pro aktuální týden
      db
        .select()
        .from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.weekStart, weekStartISO))),
      // Jednorázové objednávky uživatele pro aktuální týden
      db
        .select()
        .from(oneshotOrders)
        .where(and(eq(oneshotOrders.userId, userId), eq(oneshotOrders.weekStart, weekStartISO))),
    ]);

  const productData: Product[] = activeProducts.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceKc: p.priceKc,
  }));

  const oneshotProductData: OneshotProduct[] = oneshotProductsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceKc: p.priceKc,
  }));

  const orderData: ExistingOrder[] = existingOrdersRaw.map((o) => ({
    productId: o.productId,
    quantity: o.quantity,
    isTemporary: o.isTemporary,
    originalQuantity: o.originalQuantity,
    // permanentQty = qty trvalé objednávky: original pokud dočasná, jinak aktuální qty
    permanentQty: o.isTemporary ? (o.originalQuantity ?? 0) : o.quantity,
  }));

  const initialOneshotOrders: InitialOneshotOrder[] = existingOneshotOrdersRaw.map((o) => ({
    productId: o.productId,
    quantity: o.quantity,
  }));

  // Počáteční celková hodnota pravidelných objednávek v haléřích.
  // Výpočet na serveru – klient přepočítává lokálně při každé změně qty.
  const priceMap = new Map(productData.map((p) => [p.id, p.priceKc]));
  const initialTotal = orderData.reduce((sum, o) => {
    return sum + o.quantity * (priceMap.get(o.productId) ?? 0);
  }, 0);

  return (
    <main className="min-h-screen bg-dough-100 px-4 py-6 sm:py-10">
      <div className="max-w-md mx-auto">
        <CustomerOrderPage
          products={productData}
          existingOrders={orderData}
          weekStart={weekStartISO}
          isEditable={editable}
          deadlineInfo={deadlineInfo}
          userName={user.name}
          customerToken={token}
          initialTotal={initialTotal}
          oneshotProducts={oneshotProductData}
          initialOneshotOrders={initialOneshotOrders}
        />
        {/* Next week skip control */}
        {(() => {
          const nextWeek = getNextWeekStart(weekStart, 1);
          const nextWeekISO = formatDateISO(nextWeek);
          const nextWeekLabel = nextWeek.toLocaleDateString('cs-CZ', {
            day: 'numeric', month: 'long', year: 'numeric',
          });
          const weekAfterNext = getNextWeekStart(weekStart, 2);
          const weekAfterNextISO = formatDateISO(weekAfterNext);
          return (
            <SkipWeekButton
              nextWeekStart={nextWeekISO}
              nextWeekLabel={nextWeekLabel}
              weekAfterNext={weekAfterNextISO}
              currentSkipUntil={user.skipUntil ?? null}
              customerToken={token}
            />
          );
        })()}
      </div>
    </main>
  );
}
