'use client';

/**
 * components/customer/CustomerOrderPage.tsx
 *
 * Client Component wrapper – lifting state up pattern.
 * Drží regularTotal a oneshotTotal v useState a předává je do OrderSummary.
 * OrderForm posílá aktualizace přes onRegularTotalChange callback.
 * OneshotSection (T-008) bude posílat aktualizace přes onOneshotTotalChange.
 */

import { useState } from 'react';
import OrderForm from './OrderForm';
import OrderSummary from './OrderSummary';
import OneshotSection from './OneshotSection';
import type { Product, ExistingOrder } from './OrderForm';
import type { OneshotProduct, InitialOneshotOrder } from './OneshotSection';

interface CustomerOrderPageProps {
  products: Product[];
  existingOrders: ExistingOrder[];
  weekStart: string;
  isEditable: boolean;
  deadlineInfo: string;
  bakingDateLabel: string;
  userName: string;
  customerToken: string;
  /** Počáteční celková hodnota objednávky v haléřích, vypočtená na serveru. */
  initialTotal: number;
  /** Katalog oneshot produktů (oneshotVisible=true, active=true). */
  oneshotProducts: OneshotProduct[];
  /** Stávající oneshot objednávky uživatele pro aktuální týden. */
  initialOneshotOrders: InitialOneshotOrder[];
}

export default function CustomerOrderPage({
  products,
  existingOrders,
  weekStart,
  isEditable,
  deadlineInfo,
  bakingDateLabel,
  userName,
  customerToken,
  initialTotal,
  oneshotProducts,
  initialOneshotOrders,
}: CustomerOrderPageProps) {
  const [regularTotal, setRegularTotal] = useState<number>(initialTotal);
  // oneshotTotal bude naplněn v T-008 (OneshotSection)
  const [oneshotTotal, setOneshotTotal] = useState<number>(0);

  const totalValue = regularTotal + oneshotTotal;

  return (
    <div className="space-y-4">
      <OrderSummary total={totalValue} />

      <OrderForm
        products={products}
        existingOrders={existingOrders}
        weekStart={weekStart}
        isEditable={isEditable}
        deadlineInfo={deadlineInfo}
        bakingDateLabel={bakingDateLabel}
        userName={userName}
        customerToken={customerToken}
        onRegularTotalChange={setRegularTotal}
      />

      <OneshotSection
        oneshotProducts={oneshotProducts}
        initialOneshotOrders={initialOneshotOrders}
        weekStart={weekStart}
        customerToken={customerToken}
        isEditable={isEditable}
        onOneshotTotalChange={setOneshotTotal}
      />

      <OrderSummary total={totalValue} />
    </div>
  );
}
