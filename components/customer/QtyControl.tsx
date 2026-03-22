'use client';

/**
 * components/customer/QtyControl.tsx
 *
 * +/- tlačítka pro ovládání množství produktu.
 * Mobile-first: velké touch targety (min 44px).
 */

interface QtyControlProps {
  quantity: number;
  onChange: (newQty: number) => void;
  disabled?: boolean;
}

export default function QtyControl({ quantity, onChange, disabled = false }: QtyControlProps) {
  const handleDecrement = () => {
    if (quantity > 0) {
      onChange(quantity - 1);
    }
  };

  const handleIncrement = () => {
    onChange(quantity + 1);
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || quantity <= 0}
        className="w-11 h-11 flex items-center justify-center rounded-lg bg-dough-200 hover:bg-bread-200 text-bread-800 font-bold text-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Snížit množství"
      >
        -
      </button>
      <span className="w-10 text-center text-lg font-semibold text-bread-900 tabular-nums">
        {quantity}
      </span>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled}
        className="w-11 h-11 flex items-center justify-center rounded-lg bg-bread-500 hover:bg-bread-600 text-white font-bold text-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Zvýšit množství"
      >
        +
      </button>
    </div>
  );
}
