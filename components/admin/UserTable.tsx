'use client';

/**
 * components/admin/UserTable.tsx
 *
 * Client Component: tabulka zákazníků.
 * Akce: deaktivace, copy URL, reset tokenu, vytvoření nového zákazníka, odeslání onboarding emailu.
 */

import { useState } from 'react';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  token: string;
  active: boolean;
  skipUntil: string | null;
  createdAt: string;
}

interface ProductRow {
  id: string;
  name: string;
  sortOrder: number;
}

interface UserTableProps {
  users: UserRow[];
  adminToken: string;
  products: ProductRow[];
  nextWeekStart: string;
}

export default function UserTable({ users: initialUsers, adminToken, products, nextWeekStart }: UserTableProps) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Onboarding step 2: nastavení pravidelné objednávky
  const [onboardingUser, setOnboardingUser] = useState<UserRow | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, number>>({});
  const [orderSaving, setOrderSaving] = useState(false);

  const apiHeaders = {
    'Content-Type': 'application/json',
    'x-admin-token': adminToken,
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: apiHeaders,
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, active: !currentActive } : u)),
        );
      } else {
        const data = await res.json();
        setFeedback(data.error || 'Chyba při změně stavu.');
      }
    } catch {
      setFeedback('Chyba spojení.');
    }
  };

  const handleResetToken = async (userId: string) => {
    if (!confirm('Opravdu chcete resetovat token? Stávající odkaz přestane fungovat.')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-token`, {
        method: 'POST',
        headers: apiHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, token: data.newToken } : u)),
        );
        setFeedback(`Nový token vygenerován. URL: ${data.newUrl}`);
      } else {
        const data = await res.json();
        setFeedback(data.error || 'Chyba při resetu tokenu.');
      }
    } catch {
      setFeedback('Chyba spojení.');
    }
  };

  const handleCopyUrl = (token: string) => {
    const url = `${window.location.origin}/u/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setFeedback('URL zkopírována do schránky.');
      setTimeout(() => setFeedback(null), 2000);
    });
  };

  const handleSendOnboarding = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ userId, type: 'onboarding' }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback('Onboarding email odeslán.');
      } else {
        setFeedback(data.error || 'Chyba při odesílání emailu.');
      }
    } catch {
      setFeedback('Chyba spojení.');
    }
  };

  const handleAddUser = async () => {
    if (!newName.trim()) {
      setFeedback('Vyplňte jméno.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => [...prev, data.user]);
        setNewName('');
        setNewEmail('');
        setNewPhone('');
        setShowAddForm(false);
        // Přejít na krok 2: nastavení pravidelné objednávky
        setOnboardingUser(data.user);
        setOrderDrafts({});
      } else {
        setFeedback(data.error || 'Chyba při vytváření zákazníka.');
      }
    } catch {
      setFeedback('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string, userName: string) => {
    if (!confirm(`Opravdu smazat zákazníka „${userName}"? Smažou se i všechny jeho objednávky.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: apiHeaders,
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setFeedback(`Zákazník ${userName} byl smazán.`);
      } else {
        const data = await res.json();
        setFeedback(data.error || 'Chyba při mazání.');
      }
    } catch {
      setFeedback('Chyba spojení.');
    }
  };

  const handleSaveOrder = async () => {
    if (!onboardingUser) return;
    const items = Object.entries(orderDrafts)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    if (items.length === 0) {
      setOnboardingUser(null);
      setFeedback('Zákazník vytvořen (bez objednávky).');
      return;
    }
    setOrderSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${onboardingUser.id}/orders`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ weekStart: nextWeekStart, orders: items }),
      });
      if (res.ok) {
        setOnboardingUser(null);
        setFeedback('Zákazník vytvořen a objednávka nastavena.');
      } else {
        const data = await res.json();
        setFeedback(data.error || 'Chyba při ukládání objednávky.');
      }
    } catch {
      setFeedback('Chyba spojení.');
    } finally {
      setOrderSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Feedback */}
      {feedback && (
        <div className="bg-bread-100 text-bread-800 text-sm px-4 py-2 rounded-lg">
          {feedback}
          <button onClick={() => setFeedback(null)} className="ml-2 font-bold">
            x
          </button>
        </div>
      )}

      {/* Add user button/form */}
      {!showAddForm ? (
        <button onClick={() => setShowAddForm(true)} className="btn-primary text-sm">
          + Přidat zákazníka
        </button>
      ) : (
        <div className="card space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Jméno *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="border border-dough-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bread-400"
            />
            <input
              type="email"
              placeholder="Email (volitelný)"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="border border-dough-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bread-400"
            />
            <input
              type="tel"
              placeholder="Telefon (volitelný)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="border border-dough-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bread-400"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddUser} disabled={loading} className="btn-primary text-sm">
              {loading ? 'Vytvářím...' : 'Vytvořit'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewName('');
                setNewEmail('');
                setNewPhone('');
              }}
              className="btn-secondary text-sm"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bread-50 text-bread-800">
              <th className="text-left px-3 py-2 font-semibold">Jméno</th>
              <th className="text-left px-3 py-2 font-semibold">Email</th>
              <th className="text-left px-3 py-2 font-semibold">Telefon</th>
              <th className="text-center px-3 py-2 font-semibold">Stav</th>
              <th className="text-right px-3 py-2 font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-dough-200 hover:bg-dough-50">
                <td className="px-3 py-3 font-medium text-bread-900">{user.name}</td>
                <td className="px-3 py-3 text-gray-600">
                  {user.email ?? <span className="text-gray-300 italic">–</span>}
                </td>
                <td className="px-3 py-3 text-gray-600">
                  {user.phone ?? <span className="text-gray-300 italic">–</span>}
                </td>
                <td className="px-3 py-3 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      user.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {user.active ? 'Aktivní' : 'Neaktivní'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-1 flex-wrap">
                    <button
                      onClick={() => handleCopyUrl(user.token)}
                      className="px-2 py-1 text-xs bg-dough-200 hover:bg-bread-200 rounded transition-colors"
                      title="Kopírovat URL"
                    >
                      URL
                    </button>
                    <button
                      onClick={() => { setOnboardingUser(user); setOrderDrafts({}); }}
                      className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
                      title="Nastavit pravidelnou objednávku"
                    >
                      Objednávka
                    </button>
                    <button
                      onClick={() => handleSendOnboarding(user.id)}
                      disabled={!user.email}
                      className="px-2 py-1 text-xs bg-bread-100 hover:bg-bread-200 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={user.email ? 'Odeslat onboarding email' : 'Uživatel nemá email'}
                    >
                      Email
                    </button>
                    <button
                      onClick={() => handleResetToken(user.id)}
                      className="px-2 py-1 text-xs bg-bread-200 hover:bg-bread-300 rounded transition-colors"
                      title="Reset tokenu"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => handleToggleActive(user.id, user.active)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        user.active
                          ? 'bg-red-100 hover:bg-red-200 text-red-700'
                          : 'bg-green-100 hover:bg-green-200 text-green-700'
                      }`}
                    >
                      {user.active ? 'Deaktivovat' : 'Aktivovat'}
                    </button>
                    <button
                      onClick={() => handleDelete(user.id, user.name)}
                      className="px-2 py-1 text-xs rounded transition-colors bg-red-600 hover:bg-red-700 text-white"
                      title="Smazat zákazníka"
                    >
                      Smazat
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <p className="text-center text-gray-500 py-8">Zatím žádní zákazníci.</p>
      )}

      {/* Onboarding krok 2: nastavení pravidelné objednávky */}
      {onboardingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-bread-800 text-lg">
              Nastavit pravidelnou objednávku
            </h3>
            <p className="text-sm text-gray-600">
              Pro <strong>{onboardingUser.name}</strong>, platí od týdne {nextWeekStart}.
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-800">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderDrafts(prev => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] ?? 0) - 1) }))}
                      className="w-7 h-7 rounded border border-dough-200 text-bread-700 hover:bg-dough-100 flex items-center justify-center text-lg leading-none"
                    >−</button>
                    <span className="w-6 text-center text-sm font-medium">{orderDrafts[p.id] ?? 0}</span>
                    <button
                      type="button"
                      onClick={() => setOrderDrafts(prev => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))}
                      className="w-7 h-7 rounded border border-dough-200 text-bread-700 hover:bg-dough-100 flex items-center justify-center text-lg leading-none"
                    >+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setOnboardingUser(null); setFeedback('Zákazník vytvořen (bez objednávky).'); }}
                className="btn-secondary flex-1"
              >
                Přeskočit
              </button>
              <button
                onClick={handleSaveOrder}
                disabled={orderSaving}
                className="btn-primary flex-1"
              >
                {orderSaving ? 'Ukládám...' : 'Uložit objednávku'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
