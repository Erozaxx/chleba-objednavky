'use client';

/**
 * components/customer/SkipWeekButton.tsx
 *
 * Zákazník může přeskočit příští 1 nebo 2 týdny přímo ze své stránky.
 * BFU návrh: "Musím volat pekaři abych přeskočil týden? To je nesmysl."
 *
 * Stavy (skipWeeks: 0 | 1 | 2):
 *  0 → dvě tlačítka: "Přeskočit 1 týden" + "Přeskočit 2 týdny"
 *  1 → info + "Zrušit přeskočení" + "Přeskočit 2 týdny"
 *  2 → info + "Zrušit přeskočení"
 *
 * Rollback logika (B-001): při API chybě se skipWeeks vrátí na hodnotu před pokusem.
 */

import { useState } from 'react';

interface SkipWeekButtonProps {
  nextWeekStart: string;      // ISO datum příštího pondělí
  nextWeekLabel: string;      // lidský label příštího týdne
  weekAfterNext: string;      // ISO datum 2. příštího pondělí
  currentSkipUntil: string | null;
  customerToken: string;
}

function deriveSkipWeeks(
  currentSkipUntil: string | null,
  nextWeekStart: string,
  weekAfterNext: string,
): 0 | 1 | 2 {
  if (currentSkipUntil === null) return 0;
  // EC-007: admin může nastavit skip_until na 3+ týdny – UI zobrazí stav "2 týdny" jako cap
  if (currentSkipUntil >= weekAfterNext) return 2;
  if (currentSkipUntil >= nextWeekStart) return 1;
  // EC-001: skip_until je v minulosti
  return 0;
}

export default function SkipWeekButton({
  nextWeekStart,
  nextWeekLabel,
  weekAfterNext,
  currentSkipUntil,
  customerToken,
}: SkipWeekButtonProps) {
  const [skipWeeks, setSkipWeeks] = useState<0 | 1 | 2>(
    deriveSkipWeeks(currentSkipUntil, nextWeekStart, weekAfterNext),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSkip = async (weeksCount: 1 | 2) => {
    const previousSkipWeeks = skipWeeks;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/skip-week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-customer-token': customerToken,
        },
        body: JSON.stringify({ action: 'skip', nextWeekStart, weeksCount }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSkipWeeks(weeksCount);
      } else {
        setSkipWeeks(previousSkipWeeks);
        setError(data.error || 'Nepodařilo se přeskočit týden.');
      }
    } catch {
      setSkipWeeks(previousSkipWeeks);
      setError('Chyba spojení se serverem.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    const previousSkipWeeks = skipWeeks;
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
        setSkipWeeks(0);
      } else {
        setSkipWeeks(previousSkipWeeks);
        setError(data.error || 'Nepodařilo se zrušit přeskočení.');
      }
    } catch {
      setSkipWeeks(previousSkipWeeks);
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

      {skipWeeks === 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => handleSkip(1)}
            disabled={loading}
            className="flex-1 py-2 text-sm rounded-lg border border-bread-300 text-bread-700 hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50"
          >
            {loading ? 'Zpracovávám...' : 'Přeskočit 1 termín pečení'}
          </button>
          <button
            type="button"
            onClick={() => handleSkip(2)}
            disabled={loading}
            className="flex-1 py-2 text-sm rounded-lg border border-bread-300 text-bread-700 hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50"
          >
            {loading ? 'Zpracovávám...' : 'Přeskočit 2 termíny pečení'}
          </button>
        </div>
      )}

      {skipWeeks === 1 && (
        <div className="space-y-2">
          <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
            Příští termín pečení máte přeskočen – nepočítáme s vámi.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 py-2 text-sm rounded-lg border border-bread-300 text-bread-700 hover:bg-bread-50 transition-colors disabled:opacity-50"
            >
              {loading ? 'Zpracovávám...' : 'Zrušit přeskočení'}
            </button>
            <button
              type="button"
              onClick={() => handleSkip(2)}
              disabled={loading}
              className="flex-1 py-2 text-sm rounded-lg border border-bread-300 text-bread-700 hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50"
            >
              {loading ? 'Zpracovávám...' : 'Přeskočit 2 termíny pečení'}
            </button>
          </div>
        </div>
      )}

      {skipWeeks === 2 && (
        <div className="space-y-2">
          <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
            Příští 2 termíny pečení máte přeskočeny – nepočítáme s vámi.
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
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
