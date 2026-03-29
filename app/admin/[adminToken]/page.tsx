/**
 * app/admin/[adminToken]/page.tsx
 *
 * Server Component: admin dashboard s navigací.
 * Načítá data z DB a předává admin token jako prop pro Client Components.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { users, products, weekSettings, orders, oneshotOrders } from '@/lib/db/schema';
import { eq, desc, asc, and, gte, inArray, sql } from 'drizzle-orm';
import { getWeekStart, getNextWeekStart, formatDateISO } from '@/lib/week/utils';
import UserTable from '@/components/admin/UserTable';
import ProductTable from '@/components/admin/ProductTable';
import WeekSettingsTable from '@/components/admin/WeekSettingsTable';
import OrdersOverview from '@/components/admin/OrdersOverview';

interface AdminPageProps {
  params: { adminToken: string };
}

export default async function AdminPage({ params }: AdminPageProps) {
  const headersList = headers();
  const isAdmin = headersList.get('x-is-admin');

  if (isAdmin !== 'true') {
    redirect('/not-found');
  }

  const { adminToken } = params;

  // Fetch all users
  const allUsers = await db
    .select()
    .from(users)
    .orderBy(asc(users.name));

  // Fetch all products
  const allProducts = await db
    .select()
    .from(products)
    .orderBy(asc(products.sortOrder), asc(products.name));

  // Fetch recent week settings (last 8 weeks + future)
  const weekStart = getWeekStart();
  const eightWeeksAgo = new Date(weekStart);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
  const eightWeeksAgoISO = formatDateISO(eightWeeksAgo);

  const allWeeks = await db
    .select()
    .from(weekSettings)
    .where(gte(weekSettings.weekStart, eightWeeksAgoISO))
    .orderBy(desc(weekSettings.weekStart));

  // Current and next week ISO strings
  const weekStartISO = formatDateISO(weekStart);
  const nextWeekStart = getNextWeekStart(weekStart, 1);
  const nextWeekStartISO = formatDateISO(nextWeekStart);

  // Orders count for stats card (current week)
  const currentWeekOrdersCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.weekStart, weekStartISO), sql`${orders.quantity} > 0`));

  const orderCount = Number(currentWeekOrdersCount[0]?.count ?? 0);
  const activeUsersCount = allUsers.filter((u) => u.active).length;

  // Regular orders for current + next week (join users + products)
  const regularOrderRows = await db
    .select({
      userId: users.id,
      userName: users.name,
      productId: products.id,
      productName: products.name,
      quantity: orders.quantity,
      priceKc: products.priceKc,
      weekStart: orders.weekStart,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .where(
      and(
        inArray(orders.weekStart, [weekStartISO, nextWeekStartISO]),
        sql`${orders.quantity} > 0`,
      ),
    )
    .orderBy(asc(users.name), asc(products.sortOrder), asc(products.name));

  // Oneshot orders for current + next week
  const oneshotOrderRows = await db
    .select({
      userId: users.id,
      userName: users.name,
      productId: products.id,
      productName: products.name,
      quantity: oneshotOrders.quantity,
      priceKc: products.priceKc,
      weekStart: oneshotOrders.weekStart,
    })
    .from(oneshotOrders)
    .innerJoin(users, eq(oneshotOrders.userId, users.id))
    .innerJoin(products, eq(oneshotOrders.productId, products.id))
    .where(inArray(oneshotOrders.weekStart, [weekStartISO, nextWeekStartISO]))
    .orderBy(asc(users.name), asc(products.sortOrder), asc(products.name));

  const allOrderRows = [...regularOrderRows, ...oneshotOrderRows];

  const currentWeekOrderRows = allOrderRows
    .filter((r) => r.weekStart === weekStartISO)
    .map(({ weekStart: _w, ...r }) => r);

  const nextWeekOrderRows = allOrderRows
    .filter((r) => r.weekStart === nextWeekStartISO)
    .map(({ weekStart: _w, ...r }) => r);

  return (
    <main className="min-h-screen bg-dough-100">
      {/* Header */}
      <header className="bg-bread-800 text-white px-4 py-4 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <span className="text-bread-200 text-sm">Objednávky chleba</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-bread-600">{activeUsersCount}</div>
            <div className="text-sm text-gray-500">Aktivních zákazníků</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-bread-600">{allProducts.filter(p => p.active).length}</div>
            <div className="text-sm text-gray-500">Produktů</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-bread-600">{orderCount}</div>
            <div className="text-sm text-gray-500">Objednávek tento týden</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-bread-600">{weekStartISO}</div>
            <div className="text-sm text-gray-500">Aktuální týden</div>
          </div>
        </div>

        {/* Orders overview section */}
        <section id="orders">
          <OrdersOverview
            currentWeekStart={weekStartISO}
            nextWeekStart={nextWeekStartISO}
            currentWeekOrders={currentWeekOrderRows}
            nextWeekOrders={nextWeekOrderRows}
          />
        </section>

        {/* Users section */}
        <section id="users">
          <h2 className="text-xl font-bold text-bread-800 mb-4">Zákazníci</h2>
          <UserTable
            users={allUsers.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              token: u.token,
              active: u.active,
              skipUntil: u.skipUntil,
              createdAt: u.createdAt.toISOString(),
            }))}
            adminToken={adminToken}
          />
        </section>

        {/* Products section */}
        <section id="products">
          <h2 className="text-xl font-bold text-bread-800 mb-4">Produkty</h2>
          <ProductTable
            products={allProducts.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              active: p.active,
              sortOrder: p.sortOrder,
              priceKc: p.priceKc,
              oneshotVisible: p.oneshotVisible,
            }))}
            adminToken={adminToken}
          />
        </section>

        {/* Week settings section */}
        <section id="weeks">
          <h2 className="text-xl font-bold text-bread-800 mb-4">Nastavení týdnů</h2>
          <WeekSettingsTable
            weeks={allWeeks.map((w) => ({
              weekStart: w.weekStart,
              bakingDay: w.bakingDay,
              closed: w.closed,
              closedReason: w.closedReason,
            }))}
            currentWeekStart={weekStartISO}
            adminToken={adminToken}
          />
        </section>
      </div>
    </main>
  );
}
