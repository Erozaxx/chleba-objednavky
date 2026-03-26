'use client';

/**
 * components/customer/OneshotOrderedItem.tsx
 *
 * Řádek objednané oneshot položky.
 * Zobrazuje [−] qty [+] a [reset] tlačítko.
 * [reset] volá DELETE endpoint (odstraní záznam).
 */

import type { OneshotProduct } from './OneshotSection';

interface OneshotOrderedItemProps {
  product: OneshotProduct;
  quantity: number;
  disabled?: boolean;
  onDecrement: (productId: string) => void;
  onIncrement: (productId: string) => void;
  onReset: (productId: string) => void;
}

export default function OneshotOrderedItem({
  product,
  quantity,
  disabled = false,
  onDecrement,
  onIncrement,
  onReset,
}: OneshotOrderedItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-bread-900 truncate">{product.name}</p>
        {product.priceKc > 0 && (
          <p className="text-sm text-bread-500">{Math.floor(product.priceKc / 100)} Kč</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Decrement */}
        <button
          type="button"
          onClick={() => onDecrement(product.id)}
          disabled={disabled || quantity <= 1}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-dough-200 hover:bg-bread-200 text-bread-800 font-bold text-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Snížit množství"
        >
          −
        </button>

        {/* Quantity display */}
        <span className="w-8 text-center text-lg font-semibold text-bread-900 tabular-nums">
          {quantity}
        </span>

        {/* Increment */}
        <button
          type="button"
          onClick={() => onIncrement(product.id)}
          disabled={disabled}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-bread-500 hover:bg-bread-600 text-white font-bold text-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Zvýšit množství"
        >
          +
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={() => onReset(product.id)}
          disabled={disabled}
          className="px-2 h-10 flex items-center justify-center rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Zrušit objednávku ${product.name}`}
        >
          reset
        </button>
      </div>
    </div>
  );
}
