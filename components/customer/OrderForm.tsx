'use client';

/**
 * components/customer/OrderForm.tsx
 *
 * Client Component: formulář objednávek.
 * Mobile-first UI, hnědozlaté barvy (Tailwind bread-* třídy).
 * Pro každý produkt: název + +/- tlačítka pro quantity.
 * Toggle "dočasná změna" (jen tento týden) nebo trvalá.
 * Submit → POST /api/customer/orders.
 */

import { useState, useCallback } from 'react';
import QtyControl from './QtyControl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  description: string | null;
}

export interface ExistingOrder {
  productId: string;
  quantity: number;
  isTemporary: boolean;
  originalQuantity: number | null;
}

interface OrderFormProps {
  products: Product[];
  existingOrders: ExistingOrder[];
  weekStart: string;
  isEditable: boolean;
  deadlineInfo: string;
  userName: string;
}

interface OrderState {
  quantity: number;
  isTemporary: boolean;
  originalQuantity: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrderForm({
  products,
  existingOrders,
  weekStart,
  isEditable,
  deadlineInfo,
  userName,
}: OrderFormProps) {
  // Initialize order state from existing orders
  const buildInitialState = (): Record<string, OrderState> => {
    const state: Record<string, OrderState> = {};
    for (const product of products) {
      const existing = existingOrders.find((o) => o.productId === product.id);
      state[product.id] = {
        quantity: existing?.quantity ?? 0,
        isTemporary: existing?.isTemporary ?? false,
        originalQuantity: existing?.originalQuantity ?? null,
      };
    }
    return state;
  };

  const [orderState, setOrderState] = useState<Record<string, OrderState>>(buildInitialState);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const handleQuantityChange = useCallback((productId: string, newQty: number) => {
    setOrderState((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        quantity: newQty,
      },
    }));
    setFeedback(null);
  }, []);

  const handleTemporaryToggle = useCallback((productId: string) => {
    setOrderState((prev) => {
      const current = prev[productId];
      const nowTemporary = !current.isTemporary;
      return {
        ...prev,
        [productId]: {
          ...current,
          isTemporary: nowTemporary,
          // When marking as temporary, save current quantity as original
          originalQuantity: nowTemporary ? current.quantity : null,
        },
      };
    });
    setFeedback(null);
  }, []);

  const handleSubmit = async () => {
    setSubmitting(true);
    setFeedback(null);

    const orderItems = products.map((product) => {
      const state = orderState[product.id];
      return {
        productId: product.id,
        weekStart,
        quantity: state.quantity,
        isTemporary: state.isTemporary,
        originalQuantity: state.isTemporary ? state.originalQuantity : null,
      };
    });

    try {
      const response = await fetch('/api/customer/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: orderItems }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Objednávka uložena (${data.saved} položek).`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Nepodařilo se uložit objednávku.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Chyba spojení se serverem.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-bread-800">
          Objednávka pečiva
        </h1>
        <p className="text-bread-600 mt-1">
          {userName}
        </p>
      </div>

      {/* Deadline info */}
      <div
        className={`text-center text-sm px-4 py-2 rounded-lg ${
          isEditable
            ? 'bg-bread-100 text-bread-700'
            : 'bg-red-50 text-red-700'
        }`}
      >
        {deadlineInfo}
      </div>

      {/* Product list */}
      <div className="space-y-4">
        {products.map((product) => {
          const state = orderState[product.id];
          return (
            <div key={product.id} className="card">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-bread-800 text-base">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="text-sm text-gray-500 mt-0.5 truncate">
                      {product.description}
                    </p>
                  )}
                </div>
                <QtyControl
                  quantity={state.quantity}
                  onChange={(qty) => handleQuantityChange(product.id, qty)}
                  disabled={!isEditable}
                />
              </div>

              {/* Temporary toggle – only if editable and quantity > 0 */}
              {isEditable && state.quantity > 0 && (
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.isTemporary}
                    onChange={() => handleTemporaryToggle(product.id)}
                    className="w-5 h-5 rounded border-bread-300 text-bread-500 focus:ring-bread-500"
                  />
                  <span className="text-sm text-bread-700">
                    Jen tento týden (dočasná změna)
                  </span>
                </label>
              )}

              {/* Indicator when viewing read-only temporary order */}
              {!isEditable && state.isTemporary && (
                <p className="text-xs text-bread-500 mt-2">
                  Dočasná změna pro tento týden
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit button */}
      {isEditable && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-wait"
        >
          {submitting ? 'Ukládám...' : 'Uložit objednávku'}
        </button>
      )}

      {/* Feedback */}
      {feedback && (
        <div
          className={`text-center text-sm px-4 py-3 rounded-lg ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
