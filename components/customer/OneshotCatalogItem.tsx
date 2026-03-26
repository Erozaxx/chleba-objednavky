'use client';

/**
 * components/customer/OneshotCatalogItem.tsx
 *
 * Řádek katalogu pro neobjednaný oneshot produkt.
 * Velké zelené [+] tlačítko; disabled dokud submittingIds obsahuje product.id.
 */

import type { OneshotProduct } from './OneshotSection';

interface OneshotCatalogItemProps {
  product: OneshotProduct;
  isSubmitting: boolean;
  onAdd: (productId: string) => void;
}

export default function OneshotCatalogItem({
  product,
  isSubmitting,
  onAdd,
}: OneshotCatalogItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-bread-900 truncate">{product.name}</p>
        {product.description && (
          <p className="text-sm text-bread-600 truncate">{product.description}</p>
        )}
        {product.priceKc > 0 && (
          <p className="text-sm text-bread-500">{Math.floor(product.priceKc / 100)} Kč</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onAdd(product.id)}
        disabled={isSubmitting}
        className="w-12 h-12 flex items-center justify-center rounded-xl bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold text-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        aria-label={`Přidat ${product.name}`}
      >
        +
      </button>
    </div>
  );
}
