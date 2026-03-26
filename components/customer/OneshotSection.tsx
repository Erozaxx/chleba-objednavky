'use client';

/**
 * components/customer/OneshotSection.tsx
 *
 * Sekce jednorázových objednávek (Client Component).
 * Zobrazuje katalog neobjednaných oneshotVisible produktů a seznam objednaných.
 * Lokální state: qty map (productId → quantity) + submittingIds (Set<string>) per-item.
 *
 * Volá onOneshotTotalChange callback při každé změně (lifting state up – arch. sekce 3/F-07).
 * Optimistický update při [+]: okamžitě přidá do stavu, při chybě rollback.
 */

import { useState, useCallback, useEffect } from 'react';
import OneshotCatalogItem from './OneshotCatalogItem';
import OneshotOrderedItem from './OneshotOrderedItem';

// ---------------------------------------------------------------------------
// Types (exportovány pro použití v page.tsx a ostatních komponentách)
// ---------------------------------------------------------------------------

export interface OneshotProduct {
  id: string;
  name: string;
  description: string | null;
  priceKc: number;
}

export interface InitialOneshotOrder {
  productId: string;
  quantity: number;
}

interface OneshotSectionProps {
  oneshotProducts: OneshotProduct[];
  initialOneshotOrders: InitialOneshotOrder[];
  weekStart: string;
  customerToken: string;
  isEditable: boolean;
  /** Callback volaný při každé změně – předává součet qty*priceKc v haléřích. */
  onOneshotTotalChange?: (total: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OneshotSection({
  oneshotProducts,
  initialOneshotOrders,
  weekStart,
  customerToken,
  isEditable,
  onOneshotTotalChange,
}: OneshotSectionProps) {
  // qty map: productId → quantity (0 = neobjednáno)
  const [qtyMap, setQtyMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const order of initialOneshotOrders) {
      if (order.quantity > 0) {
        map[order.productId] = order.quantity;
      }
    }
    return map;
  });

  // submittingIds: Set produktů, pro které právě probíhá POST (katalog [+])
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  // Výpočet a propagace celkové hodnoty směrem nahoru
  const priceMap = new Map(oneshotProducts.map((p) => [p.id, p.priceKc]));

  useEffect(() => {
    if (!onOneshotTotalChange) return;
    const total = Object.entries(qtyMap).reduce((sum, [pid, qty]) => {
      return sum + qty * (priceMap.get(pid) ?? 0);
    }, 0);
    onOneshotTotalChange(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtyMap]);

  // ---------------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------------

  const postOrder = useCallback(
    async (productId: string, quantity: number): Promise<boolean> => {
      try {
        const res = await fetch('/api/customer/oneshot-orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-customer-token': customerToken,
          },
          body: JSON.stringify({ productId, weekStart, quantity }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [customerToken, weekStart],
  );

  const deleteOrder = useCallback(
    async (productId: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/customer/oneshot-orders', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-customer-token': customerToken,
          },
          body: JSON.stringify({ productId, weekStart }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [customerToken, weekStart],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /** [+] v katalogu – přidá novou objednávku qty=1 (optimistický update + submittingIds). */
  const handleAdd = useCallback(
    async (productId: string) => {
      if (!isEditable) return;
      if (submittingIds.has(productId)) return;

      const prevQty = qtyMap[productId] ?? 0;
      const newQty = prevQty + 1;

      // Optimistický update
      setQtyMap((prev) => ({ ...prev, [productId]: newQty }));
      setSubmittingIds((prev) => new Set(prev).add(productId));

      const ok = await postOrder(productId, newQty);

      setSubmittingIds((prev) => {
        const n = new Set(prev);
        n.delete(productId);
        return n;
      });

      if (!ok) {
        // Rollback
        setQtyMap((prev) => {
          const next = { ...prev };
          if (prevQty === 0) {
            delete next[productId];
          } else {
            next[productId] = prevQty;
          }
          return next;
        });
      }
    },
    [isEditable, submittingIds, qtyMap, postOrder],
  );

  /** [+] u objednané položky – zvýší qty o 1. */
  const handleIncrement = useCallback(
    async (productId: string) => {
      if (!isEditable) return;
      const prevQty = qtyMap[productId] ?? 1;
      const newQty = prevQty + 1;

      setQtyMap((prev) => ({ ...prev, [productId]: newQty }));

      const ok = await postOrder(productId, newQty);
      if (!ok) {
        setQtyMap((prev) => ({ ...prev, [productId]: prevQty }));
      }
    },
    [isEditable, qtyMap, postOrder],
  );

  /** [−] u objednané položky – sníží qty o 1; pokud qty = 1 → DELETE. */
  const handleDecrement = useCallback(
    async (productId: string) => {
      if (!isEditable) return;
      const prevQty = qtyMap[productId] ?? 1;

      if (prevQty <= 1) {
        // qty by kleslo na 0 → smazat
        await handleReset(productId);
        return;
      }

      const newQty = prevQty - 1;
      setQtyMap((prev) => ({ ...prev, [productId]: newQty }));

      const ok = await postOrder(productId, newQty);
      if (!ok) {
        setQtyMap((prev) => ({ ...prev, [productId]: prevQty }));
      }
    },
    // handleReset je definován níže – circular dep vyřešen přes useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isEditable, qtyMap, postOrder],
  );

  /** [reset] – smaže objednávku (DELETE). */
  const handleReset = useCallback(
    async (productId: string) => {
      if (!isEditable) return;
      const prevQty = qtyMap[productId];

      // Optimistický update
      setQtyMap((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });

      const ok = await deleteOrder(productId);
      if (!ok) {
        // Rollback
        if (prevQty !== undefined) {
          setQtyMap((prev) => ({ ...prev, [productId]: prevQty }));
        }
      }
    },
    [isEditable, qtyMap, deleteOrder],
  );

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  // Objednané produkty: ty, které mají qty > 0 v qtyMap
  const orderedProducts = oneshotProducts.filter((p) => (qtyMap[p.id] ?? 0) > 0);

  // Katalog: oneshotVisible produkty, které ještě nejsou objednané
  const catalogProducts = oneshotProducts.filter((p) => (qtyMap[p.id] ?? 0) === 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="rounded-2xl border-t-2 border-green-400 bg-green-50 p-4 space-y-1">
      {/* Hlavička sekce */}
      <h2 className="text-base font-bold text-green-800 uppercase tracking-wide mb-2">
        Jednorázové položky
      </h2>

      {!isEditable && (
        <p className="text-sm text-gray-500 mb-2">Objednávky jsou uzamčeny.</p>
      )}

      {/* Katalog neobjednaných položek */}
      {catalogProducts.length > 0 ? (
        <div className="divide-y divide-green-200">
          {catalogProducts.map((product) => (
            <OneshotCatalogItem
              key={product.id}
              product={product}
              isSubmitting={submittingIds.has(product.id) || !isEditable}
              onAdd={handleAdd}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-green-700 py-2">Všechny položky jsou objednány.</p>
      )}

      {/* Objednané položky */}
      {orderedProducts.length > 0 && (
        <>
          <div className="pt-3 border-t border-green-200">
            <p className="text-sm font-semibold text-green-700 mb-1">Objednáno:</p>
            <div className="divide-y divide-green-200">
              {orderedProducts.map((product) => (
                <OneshotOrderedItem
                  key={product.id}
                  product={product}
                  quantity={qtyMap[product.id] ?? 1}
                  disabled={!isEditable}
                  onDecrement={handleDecrement}
                  onIncrement={handleIncrement}
                  onReset={handleReset}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
