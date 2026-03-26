'use client';

/**
 * components/customer/OrderSummary.tsx
 *
 * Zobrazuje celkovou hodnotu objednávky zákazníka (pravidelné + jednorázové).
 * Hodnota se aktualizuje lokálně při každé změně qty – bez dalšího fetch.
 */

interface OrderSummaryProps {
  total: number; // celková hodnota v haléřích
}

export default function OrderSummary({ total }: OrderSummaryProps) {
  // haléře ignorujeme záměrně (pekárna pracuje s celými Kč)
  const totalKc = Math.floor(total / 100);

  return (
    <div className="bg-bread-50 border border-bread-200 rounded-lg px-4 py-3 flex items-center justify-between">
      <span className="text-sm font-medium text-bread-700">Celková hodnota objednávky</span>
      <span className="text-lg font-bold text-bread-800">{totalKc} Kč</span>
    </div>
  );
}
