'use client';

/**
 * app/admin/[adminToken]/request/page.tsx
 *
 * Formulář pro zadání požadavku na AI změnu vzhledu webu.
 * Mobile-first, BFU-friendly, keyboard-aware.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RequestStatus = 'idle' | 'sending' | 'queued' | 'in_progress' | 'completed' | 'failure';

interface HistoryItem {
  sha: string;
  message: string;
  date: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATE_LIMIT_SECONDS = 5 * 60; // 5 min
const POLL_INTERVAL = 5_000; // 5s

const EXAMPLE_PROMPTS = [
  'Zvětšit nadpis na hlavní stránce',
  'Změnit barvu tlačítek na tmavší hnědou',
  'Přidat více prostoru mezi sekce na stránce',
  'Zmenšit logo a posunout ho doleva',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RequestPage() {
  const params = useParams();
  const adminToken = params.adminToken as string;

  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [since, setSince] = useState<string | null>(null);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownLabel, setCooldownLabel] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [rollbackConfirm, setRollbackConfirm] = useState(false);
  const [rollbackStatus, setRollbackStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorPrompt, setErrorPrompt] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = useCallback(
    () => ({ 'Content-Type': 'application/json', 'x-admin-token': adminToken }),
    [adminToken],
  );

  // ---- Cooldown timer ----
  useEffect(() => {
    if (cooldownEnd === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
      if (remaining <= 0) {
        setCooldownEnd(null);
        setCooldownLabel('');
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        return;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      setCooldownLabel(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    cooldownRef.current = setInterval(tick, 1000);
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [cooldownEnd]);

  // ---- Poll status ----
  useEffect(() => {
    if (!since || (status !== 'queued' && status !== 'in_progress')) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/admin/request/status?since=${encodeURIComponent(since)}`,
          { headers: headers() },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'completed') {
          setStatus('completed');
          fetchHistory();
        } else if (data.status === 'failure') {
          setStatus('failure');
          setErrorPrompt(prompt);
        } else if (data.status === 'in_progress') {
          setStatus('in_progress');
        }
      } catch {
        // silent – retry next tick
      }
    };
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, status]);

  // ---- Fetch history on mount ----
  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/admin/request/status?history=1', { headers: headers() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.history) setHistory(data.history);
    } catch {
      // silent
    }
  };

  // ---- Submit ----
  const handleSubmit = async () => {
    if (!prompt.trim() || cooldownEnd) return;
    setStatus('sending');
    setErrorPrompt('');

    try {
      const res = await fetch('/api/admin/request', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (res.status === 429) {
        const data = await res.json();
        setCooldownEnd(Date.now() + (data.retryAfter ?? RATE_LIMIT_SECONDS) * 1000);
        setStatus('idle');
        return;
      }

      if (!res.ok) {
        setStatus('failure');
        setErrorPrompt(prompt);
        return;
      }

      const data = await res.json();
      setSince(data.since);
      setStatus('queued');
      setCooldownEnd(Date.now() + RATE_LIMIT_SECONDS * 1000);
    } catch {
      setStatus('failure');
      setErrorPrompt(prompt);
    }
  };

  // ---- Rollback ----
  const handleRollback = async () => {
    if (!history.length) return;
    setRollbackStatus('sending');
    try {
      const res = await fetch('/api/admin/request/rollback', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ commitSha: history[0].sha }),
      });
      if (res.ok) {
        setRollbackStatus('done');
        setRollbackConfirm(false);
      } else {
        setRollbackStatus('error');
      }
    } catch {
      setRollbackStatus('error');
    }
  };

  // ---- Keyboard-aware scroll ----
  const scrollToTextarea = () => {
    setTimeout(() => {
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  // ---- Helpers ----
  const isButtonDisabled = !prompt.trim() || !!cooldownEnd || status === 'sending' || status === 'queued' || status === 'in_progress';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const humanMessage = (msg: string) => {
    // Strip [ui-agent: ...] prefix and return human-readable part
    const match = msg.match(/\[ui-agent:[^\]]*\]\s*(.*)/);
    if (match && match[1]) return match[1];
    // Fallback: strip common technical prefixes
    const cleaned = msg.replace(/^(fix|feat|chore|refactor|style|ui):\s*/i, '');
    return cleaned || 'Změna vzhledu';
  };

  // ---- Render ----
  return (
    <main className="min-h-screen bg-dough-100">
      {/* Header */}
      <header className="bg-bread-800 text-white px-4 py-4 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">Vzhled webu</h1>
          <a
            href={`/admin/${adminToken}`}
            className="text-bread-200 text-sm hover:text-white transition-colors"
          >
            &larr; Dashboard
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Explanation */}
        <div className="card">
          <p className="text-bread-800 font-medium mb-2">
            Tady můžete měnit vzhled vašeho webu – barvy, velikosti písma, rozvržení prvků.
          </p>
          <p className="text-gray-500 text-sm">
            Změny v datech (produkty, objednávky) se tady nemění.
          </p>
        </div>

        {/* ---- Status banners ---- */}
        {status === 'sending' && (
          <div className="card border-bread-300 bg-bread-50 text-center">
            <div className="animate-pulse text-bread-700 font-semibold">
              Posílám vaši změnu ke zpracování...
            </div>
          </div>
        )}

        {(status === 'queued' || status === 'in_progress') && (
          <div className="card border-bread-300 bg-bread-50 text-center space-y-3">
            <div className="flex justify-center">
              <span className="inline-block h-8 w-8 rounded-full border-4 border-bread-400 border-t-transparent animate-spin" />
            </div>
            <p className="text-bread-700 font-semibold">
              Umělá inteligence pracuje na změně
            </p>
            <p className="text-bread-600 text-sm">(obvykle 1&ndash;2 minuty)</p>
          </div>
        )}

        {status === 'completed' && (
          <div className="card border-green-300 bg-green-50 text-center space-y-3">
            <p className="text-green-800 font-semibold text-lg">Hotovo! Změna je na webu.</p>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block btn-primary"
            >
              Podívat se &rarr;
            </a>
            <button
              onClick={() => { setStatus('idle'); setPrompt(''); }}
              className="block mx-auto text-sm text-gray-500 hover:text-gray-700 mt-2"
            >
              Zadat další změnu
            </button>
          </div>
        )}

        {status === 'failure' && (
          <div className="card border-red-300 bg-red-50 text-center space-y-3">
            <p className="text-red-800 font-semibold">
              Změnu se bohužel nepodařilo provést.
            </p>
            <p className="text-red-600 text-sm">
              Zkuste to prosím znovu jinými slovy – například místo &quot;uprav header&quot;
              zkuste &quot;zmenši nadpis na hlavní stránce&quot;.
              Pokud problém přetrvává, může jít o dočasnou technickou závadu.
            </p>
            <button
              onClick={() => {
                setStatus('idle');
                setPrompt(errorPrompt);
                textareaRef.current?.focus();
              }}
              className="btn-primary bg-red-600 hover:bg-red-700 min-h-[48px]"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {/* ---- Form (hidden during processing / result) ---- */}
        {(status === 'idle' || status === 'failure') && (
          <div className="card space-y-4">
            <label htmlFor="prompt-input" className="block text-bread-800 font-semibold">
              Co chcete na webu změnit?
            </label>

            {/* Example chips – above textarea so user sees them first */}
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => { setPrompt(ex); textareaRef.current?.focus(); }}
                  className="text-sm bg-dough-200 hover:bg-bread-100 text-bread-800 rounded-full px-4 py-2 min-h-[44px] border border-crust-light transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>

            <textarea
              id="prompt-input"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={scrollToTextarea}
              maxLength={2000}
              rows={4}
              className="w-full rounded-lg border border-dough-200 focus:border-bread-400 focus:ring-2 focus:ring-bread-300 p-3 text-base resize-y min-h-[6rem]"
              placeholder="např.: Zvětšit nadpis na hlavní stránce"
            />

            <p className="text-gray-400 text-xs">
              Popište svými slovy, co chcete na webu změnit. Nemusíte být techničtí.
              ({prompt.length}/2000 znaků)
            </p>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={isButtonDisabled}
              className="w-full min-h-[48px] rounded-lg font-bold text-base transition-colors
                disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
                bg-bread-500 hover:bg-bread-600 text-white"
            >
              {cooldownEnd
                ? `Další změnu můžete odeslat za ${cooldownLabel}`
                : 'Odeslat změnu'}
            </button>

            <p className="text-gray-400 text-xs text-center">
              Tato funkce mění POUZE vzhled webu (barvy, velikosti, rozvržení).
              Produkty a objednávky se nemění.
            </p>
          </div>
        )}

        {/* ---- History / Rollback ---- */}
        {history.length > 0 && (
          <div className="card space-y-4">
            <h2 className="text-bread-800 font-semibold">Poslední změny</h2>

            <ul className="divide-y divide-dough-200">
              {history.map((item, i) => (
                <li key={item.sha} className="py-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-800">{humanMessage(item.message)}</p>
                    <p className="text-xs text-gray-400">{formatTime(item.date)}</p>
                  </div>
                  {i === 0 && (
                    <button
                      onClick={() => setRollbackConfirm(true)}
                      className="shrink-0 text-sm bg-dough-200 hover:bg-red-100 text-bread-800 hover:text-red-700 rounded-lg px-4 py-2.5 min-h-[44px] border border-crust-light transition-colors"
                    >
                      Vrátit změnu
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rollback confirmation dialog */}
        {rollbackConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
              <h3 className="font-bold text-bread-800 text-lg">Vrátit poslední změnu?</h3>
              <p className="text-gray-600 text-sm">
                Web se vrátí do stavu před změnou. Žádná data se neztratí.
              </p>

              {rollbackStatus === 'error' && (
                <p className="text-red-600 text-sm">Nepodařilo se vrátit změnu. Zkuste to znovu.</p>
              )}

              {rollbackStatus === 'done' ? (
                <div className="text-center space-y-2">
                  <p className="text-green-700 font-semibold">Vrácení změny bylo zahájeno.</p>
                  <button
                    onClick={() => { setRollbackConfirm(false); setRollbackStatus('idle'); }}
                    className="btn-primary w-full min-h-[48px]"
                  >
                    Zavřít
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => { setRollbackConfirm(false); setRollbackStatus('idle'); }}
                    className="btn-secondary flex-1 min-h-[48px]"
                  >
                    Zrušit
                  </button>
                  <button
                    onClick={handleRollback}
                    disabled={rollbackStatus === 'sending'}
                    className="flex-1 min-h-[48px] rounded-lg font-bold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                  >
                    {rollbackStatus === 'sending' ? 'Vracím...' : 'Ano, vrátit'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
