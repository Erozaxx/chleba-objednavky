'use client';

/**
 * components/customer/SkipWeekButton.tsx
 *
 * Zákazník může přeskočit příští týden přímo ze své stránky.
 * BFU návrh: "Musím volat pekaři abych přeskočil týden? To je nesmysl."
 *
 * Zobrazuje:
 *  - pokud příští týden není přeskočen: tlačítko "Přeskočit příští týden"
 *  - pokud je přeskočen: info + tlačítko "Zrušit přeskočení"
 */

import { useState } from 'react';

interface SkipWeekButtonProps {
  nextWeekStart: string;
  nextWeekLabel: string;
  currentSkipUntil: string | null;
  customerToken: string;
}

export default function SkipWeekButton({
  nextWeekStart,
  nextWeekLabel,
  currentSkipUntil,
  customerToken,
}: SkipWeekButtonProps) {
  const isSkipped = currentSkipUntil !== null && currentSkipUntil >= nextWeekStart;
  const [skipped, setSkipped] = useState(isSkipped);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSkip = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/skip-week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-token': customerToken,
        },
        body: JSON.stringify({ action: 'skip', nextWeekStart }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSkipped(true);
      } else {
        setError(data.error || 'Nepodařilo se přeskočit týden.');
      }
    } catch {
      setError('Chyba spojení se serverem.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/skip-week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-token': customerToken,
        },
        body: JSON.stringify({ action: 'cancel', nextWeekStart }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSkipped(false);
      } else {
        setError(data.error || 'Nepodařilo se zrušit přeskočení.');
      }
    } catch {
      setError('Chyba spojení se serverem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-dough-200 bg-white">
      <p className="text-sm font-medium text-bread-800 mb-2">
        Příští týden: {nextWeekLabel}
      </p>

      {skipped ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
            Příští týden máte přeskočen – nepočítáme s vámi.
          </p>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="w-full py-2 text-sm rounded-lg border border-bread-300 text-bread-700 hover:bg-bread-50 transition-colors disabled:opacity-50"
          >
            {loading ? 'Zpracovávám...' : 'Zrušit přeskočení'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSkip}
          disabled={loading}
          className="w-full py-2 text-sm rounded-lg border border-bread-300 text-bread-700 hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50"
        >
          {loading ? 'Zpracovávám...' : 'Přeskočit příští týden'}
        </button>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
