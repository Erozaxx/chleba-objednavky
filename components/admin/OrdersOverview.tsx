'use client';

/**
 * components/admin/OrdersOverview.tsx
 *
 * Přehled objednávek pro admin – záložky:
 * 1. Součet produktů (kolik kusů celkem každý produkt)
 * 2. Zákazníci + cena (seznam lidí s celkovou cenou)
 * 3. Detail (per-osoba, rozbalovatelný)
 *
 * Přeskočení uživatelé (skipUntil >= příští týden) jsou:
 * - vyloučeni ze součtů produktů a celkových sum
 * - zobrazeni červeně ve všech záložkách pro příští týden
 */

import React, { useState } from 'react';

export interface OrderRow {
  userId: string;
  userName: string;
  productId: string;
  productName: string;
  quantity: number;
  priceKc: number;
  isTemporary?: boolean;
  isOneshot?: boolean;
}

interface Props {
  currentWeekStart: string;
  nextWeekStart: string;
  currentWeekOrders: OrderRow[];
  nextWeekOrders: OrderRow[];
  /** userId zákazníků, kteří mají příští týden přeskočen */
  skippedNextWeekUserIds: string[];
}

type Tab = 'products' | 'customers' | 'detail';

function formatKc(halers: number): string {
  return `${Math.round(halers / 100)} Kč`;
}

export default function OrdersOverview({
  currentWeekStart,
  nextWeekStart,
  currentWeekOrders,
  nextWeekOrders,
  skippedNextWeekUserIds,
}: Props) {
  const [week, setWeek] = useState<'current' | 'next'>('next');
  const [tab, setTab] = useState<Tab>('products');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const orders = week === 'current' ? currentWeekOrders : nextWeekOrders;
  const weekLabel = week === 'current' ? currentWeekStart : nextWeekStart;
  const skipped = new Set(week === 'next' ? skippedNextWeekUserIds : []);

  // Uživatelé s nestandardní objednávkou (dočasná nebo jednorázová)
  const nonStandardUsers = new Set(
    orders
      .filter((o) => o.isTemporary || o.isOneshot)
      .map((o) => o.userId),
  );

  const nonStandardStyle: React.CSSProperties = {
    background: 'repeating-linear-gradient(45deg, #f0fdf4, #f0fdf4 3px, transparent 3px, transparent 10px)',
  };

  // Objednávky bez přeskočených uživatelů (pro součty)
  const activeOrders = orders.filter((o) => !skipped.has(o.userId));

  // ---- Součet produktů (jen aktivní uživatelé) ----
  const productTotals = Object.values(
    activeOrders.reduce<Record<string, { name: string; qty: number; total: number }>>((acc, o) => {
      if (!acc[o.productId]) acc[o.productId] = { name: o.productName, qty: 0, total: 0 };
      acc[o.productId].qty += o.quantity;
      acc[o.productId].total += o.quantity * o.priceKc;
      return acc;
    }, {}),
  ).sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  // ---- Součet zákazníků (všichni, skipped označeni) ----
  const customerTotals = Object.values(
    orders.reduce<Record<string, { id: string; name: string; qty: number; total: number; skipped: boolean }>>((acc, o) => {
      if (!acc[o.userId]) acc[o.userId] = { id: o.userId, name: o.userName, qty: 0, total: 0, skipped: skipped.has(o.userId) };
      acc[o.userId].qty += o.quantity;
      acc[o.userId].total += o.quantity * o.priceKc;
      return acc;
    }, {}),
  ).sort((a, b) => {
    // Přeskočení na konec
    if (a.skipped !== b.skipped) return a.skipped ? 1 : -1;
    return a.name.localeCompare(b.name, 'cs');
  });

  // ---- Detail per zákazník ----
  const customerDetail = orders.reduce<
    Record<string, { name: string; skipped: boolean; items: { product: string; qty: number; price: number }[] }>
  >((acc, o) => {
    if (!acc[o.userId]) acc[o.userId] = { name: o.userName, skipped: skipped.has(o.userId), items: [] };
    acc[o.userId].items.push({ product: o.productName, qty: o.quantity, price: o.quantity * o.priceKc });
    return acc;
  }, {});

  const toggleExpand = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const activeTotalQty = activeOrders.reduce((s, o) => s + o.quantity, 0);
  const activeTotalPrice = activeOrders.reduce((s, o) => s + o.quantity * o.priceKc, 0);
  const activeUserCount = new Set(activeOrders.map((o) => o.userId)).size;
  const skippedCount = skipped.size;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'products', label: 'Součet produktů' },
    { key: 'customers', label: 'Zákazníci + cena' },
    { key: 'detail', label: 'Detail' },
  ];

  return (
    <div className="card space-y-4">
      {/* Week selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-bread-800">Přehled objednávek</h2>
        <div className="flex rounded-lg border border-dough-200 overflow-hidden">
          <button
            onClick={() => setWeek('current')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              week === 'current'
                ? 'bg-bread-600 text-white'
                : 'bg-white text-gray-600 hover:bg-dough-100'
            }`}
          >
            Tento týden
            <span className="ml-1 text-xs opacity-70">({currentWeekStart})</span>
          </button>
          <button
            onClick={() => setWeek('next')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-dough-200 ${
              week === 'next'
                ? 'bg-bread-600 text-white'
                : 'bg-white text-gray-600 hover:bg-dough-100'
            }`}
          >
            Příští týden
            <span className="ml-1 text-xs opacity-70">({nextWeekStart})</span>
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {orders.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          <span>
            <strong className="text-bread-700">{activeUserCount}</strong> zákazníků
          </span>
          <span>
            <strong className="text-bread-700">{activeTotalQty}</strong> ks celkem
          </span>
          <span>
            <strong className="text-bread-700">{formatKc(activeTotalPrice)}</strong> celkem
          </span>
          {skippedCount > 0 && (
            <span className="text-red-500">
              <strong>{skippedCount}</strong> přeskočeno
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-dough-200">
        <div className="flex gap-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? 'border-bread-600 text-bread-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {orders.length === 0 && (
        <p className="text-gray-400 text-sm py-4 text-center">
          Žádné objednávky pro týden {weekLabel}.
        </p>
      )}

      {/* Tab: Součet produktů */}
      {tab === 'products' && orders.length > 0 && (
        <div className="overflow-x-auto">
          {skippedCount > 0 && (
            <p className="text-xs text-red-500 mb-2">Součty nezahrnují přeskočené zákazníky.</p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-dough-200">
                <th className="pb-2 font-medium">Produkt</th>
                <th className="pb-2 font-medium text-right">Kusů</th>
                <th className="pb-2 font-medium text-right">Celková cena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dough-100">
              {productTotals.map((p) => (
                <tr key={p.name}>
                  <td className="py-2.5 text-gray-800">{p.name}</td>
                  <td className="py-2.5 text-right font-semibold text-bread-700">{p.qty}</td>
                  <td className="py-2.5 text-right text-gray-600">{formatKc(p.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-dough-200 font-semibold">
                <td className="pt-2.5 text-gray-700">Celkem</td>
                <td className="pt-2.5 text-right text-bread-700">{activeTotalQty}</td>
                <td className="pt-2.5 text-right text-gray-700">{formatKc(activeTotalPrice)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tab: Zákazníci + cena */}
      {tab === 'customers' && orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-dough-200">
                <th className="pb-2 font-medium">Zákazník</th>
                <th className="pb-2 font-medium text-right">Kusů</th>
                <th className="pb-2 font-medium text-right">Cena</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dough-100">
              {customerTotals.map((c) => (
                <tr
                  key={c.id}
                  className={c.skipped ? 'bg-red-50' : ''}
                  style={!c.skipped && nonStandardUsers.has(c.id) ? nonStandardStyle : undefined}
                >
                  <td className={`py-2.5 ${c.skipped ? 'text-red-600' : 'text-gray-800'}`}>
                    {c.name}
                    {c.skipped && <span className="ml-2 text-xs font-medium text-red-400">(přeskočeno)</span>}
                    {!c.skipped && nonStandardUsers.has(c.id) && <span className="ml-2 text-xs font-medium text-green-600">*</span>}
                  </td>
                  <td className={`py-2.5 text-right ${c.skipped ? 'text-red-400 line-through' : 'text-bread-700'}`}>{c.qty}</td>
                  <td className={`py-2.5 text-right ${c.skipped ? 'text-red-400 line-through' : 'text-gray-600'}`}>{formatKc(c.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-dough-200 font-semibold">
                <td className="pt-2.5 text-gray-700">Celkem (bez přeskočených)</td>
                <td className="pt-2.5 text-right text-bread-700">{activeTotalQty}</td>
                <td className="pt-2.5 text-right text-gray-700">{formatKc(activeTotalPrice)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tab: Detail per zákazník */}
      {tab === 'detail' && orders.length > 0 && (
        <div className="space-y-1">
          {Object.entries(customerDetail)
            .sort(([, a], [, b]) => {
              if (a.skipped !== b.skipped) return a.skipped ? 1 : -1;
              return a.name.localeCompare(b.name, 'cs');
            })
            .map(([userId, c]) => {
              const isOpen = expanded.has(userId);
              const userTotal = c.items.reduce((s, i) => s + i.price, 0);
              const userQty = c.items.reduce((s, i) => s + i.qty, 0);
              return (
                <div key={userId} className={`border rounded-lg overflow-hidden ${c.skipped ? 'border-red-200' : nonStandardUsers.has(userId) ? 'border-green-200' : 'border-dough-200'}`}>
                  <button
                    onClick={() => toggleExpand(userId)}
                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors text-left ${
                      c.skipped ? 'bg-red-50 hover:bg-red-100' : 'bg-white hover:bg-dough-50'
                    }`}
                    style={!c.skipped && nonStandardUsers.has(userId) ? nonStandardStyle : undefined}
                  >
                    <span className={`font-medium ${c.skipped ? 'text-red-700' : 'text-gray-800'}`}>
                      {c.name}
                      {c.skipped && <span className="ml-2 text-xs font-normal text-red-400">(přeskočeno)</span>}
                      {!c.skipped && nonStandardUsers.has(userId) && <span className="ml-2 text-xs font-normal text-green-600">*</span>}
                    </span>
                    <span className="flex items-center gap-3 text-sm">
                      <span className={c.skipped ? 'text-red-400 line-through' : 'text-gray-500'}>{userQty} ks</span>
                      <span className={c.skipped ? 'text-red-400 line-through' : 'text-bread-700 font-semibold'}>{formatKc(userTotal)}</span>
                      <span className={`transition-transform ${isOpen ? 'rotate-90' : ''} ${c.skipped ? 'text-red-300' : 'text-gray-400'}`}>
                        ›
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className={`border-t px-4 py-2 ${c.skipped ? 'border-red-200 bg-red-50' : 'border-dough-200 bg-dough-50'}`}>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-dough-100">
                          {c.items.map((item) => (
                            <tr key={item.product}>
                              <td className={`py-1.5 ${c.skipped ? 'text-red-400 line-through' : 'text-gray-700'}`}>{item.product}</td>
                              <td className={`py-1.5 text-right ${c.skipped ? 'text-red-400 line-through' : 'text-gray-500'}`}>× {item.qty}</td>
                              <td className={`py-1.5 text-right w-20 ${c.skipped ? 'text-red-400 line-through' : 'text-gray-600'}`}>{formatKc(item.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
