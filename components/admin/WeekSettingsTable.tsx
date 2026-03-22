'use client';

/**
 * components/admin/WeekSettingsTable.tsx
 *
 * Client Component: tabulka týdnů (zavřít/otevřít týden, nastavit baking day).
 */

import { useState } from 'react';

const DAY_NAMES: Record<number, string> = {
  1: 'Pondělí',
  2: 'Úterý',
  3: 'Středa',
  4: 'Čtvrtek',
  5: 'Pátek',
  6: 'Sobota',
  7: 'Neděle',
};

interface WeekRow {
  weekStart: string;
  bakingDay: number | null;
  closed: boolean;
  closedReason: string | null;
}

interface WeekSettingsTableProps {
  weeks: WeekRow[];
  currentWeekStart: string;
  adminToken: string;
}

export default function WeekSettingsTable({
  weeks: initialWeeks,
  currentWeekStart,
  adminToken,
}: WeekSettingsTableProps) {
  const [weeks, setWeeks] = useState<WeekRow[]>(initialWeeks);
  const [feedback, setFeedback] = useState<string | null>(null);

  const apiHeaders = {
    'Content-Type': 'application/json',
    'x-admin-token': adminToken,
  };

  const handleToggleClosed = async (weekStart: string, currentClosed: boolean) => {
    try {
      const res = await fetch(`/api/admin/weeks/${weekStart}`, {
        method: 'PATCH',
        headers: apiHeaders,
        body: JSON.stringify({
          closed: !currentClosed,
          closedReason: !currentClosed ? 'Uzavřeno adminem' : null,
        }),
      });
      if (res.ok) {
        setWeeks((prev) =>
          prev.map((w) =>
            w.weekStart === weekStart
              ? { ...w, closed: !currentClosed, closedReason: !currentClosed ? 'Uzavřeno adminem' : null }
              : w,
          ),
        );
        setFeedback(`Týden ${weekStart} ${!currentClosed ? 'uzavřen' : 'otevřen'}.`);
      }
    } catch {
      setFeedback('Chyba spojení.');
    }
  };

  const handleChangeBakingDay = async (weekStart: string, bakingDay: number) => {
    try {
      // Use weeks POST (upsert) to create/update week settings
      const res = await fetch('/api/admin/weeks', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ weekStart, bakingDay }),
      });
      if (res.ok) {
        setWeeks((prev) => {
          const exists = prev.find((w) => w.weekStart === weekStart);
          if (exists) {
            return prev.map((w) =>
              w.weekStart === weekStart ? { ...w, bakingDay } : w,
            );
          }
          return [...prev, { weekStart, bakingDay, closed: false, closedReason: null }];
        });
        setFeedback(`Den pečení pro ${weekStart} nastaven na ${DAY_NAMES[bakingDay]}.`);
      }
    } catch {
      setFeedback('Chyba spojení.');
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="bg-bread-100 text-bread-800 text-sm px-4 py-2 rounded-lg">
          {feedback}
          <button onClick={() => setFeedback(null)} className="ml-2 font-bold">
            x
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bread-50 text-bread-800">
              <th className="text-left px-3 py-2 font-semibold">Týden od</th>
              <th className="text-center px-3 py-2 font-semibold">Den pečení</th>
              <th className="text-center px-3 py-2 font-semibold">Stav</th>
              <th className="text-right px-3 py-2 font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            {/* Always show current week even if no settings exist */}
            {!weeks.find((w) => w.weekStart === currentWeekStart) && (
              <tr className="border-b border-dough-200 bg-bread-50/50">
                <td className="px-3 py-3 font-medium text-bread-900">
                  {currentWeekStart}
                  <span className="ml-2 text-xs text-bread-500">(aktuální)</span>
                </td>
                <td className="px-3 py-3 text-center">
                  <select
                    defaultValue={5}
                    onChange={(e) =>
                      handleChangeBakingDay(currentWeekStart, Number(e.target.value))
                    }
                    className="border border-bread-300 rounded px-2 py-1 text-sm"
                  >
                    {Object.entries(DAY_NAMES).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                    Otevřený
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={() => handleToggleClosed(currentWeekStart, false)}
                    className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                  >
                    Uzavřít
                  </button>
                </td>
              </tr>
            )}
            {weeks.map((week) => (
              <tr
                key={week.weekStart}
                className={`border-b border-dough-200 hover:bg-dough-50 ${
                  week.weekStart === currentWeekStart ? 'bg-bread-50/50' : ''
                }`}
              >
                <td className="px-3 py-3 font-medium text-bread-900">
                  {week.weekStart}
                  {week.weekStart === currentWeekStart && (
                    <span className="ml-2 text-xs text-bread-500">(aktuální)</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  <select
                    value={week.bakingDay ?? 5}
                    onChange={(e) =>
                      handleChangeBakingDay(week.weekStart, Number(e.target.value))
                    }
                    className="border border-bread-300 rounded px-2 py-1 text-sm"
                  >
                    {Object.entries(DAY_NAMES).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      week.closed
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {week.closed ? 'Uzavřený' : 'Otevřený'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    onClick={() => handleToggleClosed(week.weekStart, week.closed)}
                    className={`px-2 py-1 text-xs rounded ${
                      week.closed
                        ? 'bg-green-100 hover:bg-green-200 text-green-700'
                        : 'bg-red-100 hover:bg-red-200 text-red-700'
                    }`}
                  >
                    {week.closed ? 'Otevřít' : 'Uzavřít'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {weeks.length === 0 && (
        <p className="text-sm text-gray-500 mt-2">
          Žádné záznamy – používají se výchozí nastavení (pečení v pátek).
        </p>
      )}
    </div>
  );
}
