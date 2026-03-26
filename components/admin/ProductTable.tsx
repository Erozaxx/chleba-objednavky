'use client';

/**
 * components/admin/ProductTable.tsx
 *
 * Client Component: tabulka produktů (přidat/editovat/deaktivovat).
 */

import { useState } from 'react';

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  priceKc: number;        // haléře, e.g. 3500 = 35 Kč
  oneshotVisible: boolean;
}

interface ProductTableProps {
  products: ProductRow[];
  adminToken: string;
}

function SectionBadge({ active, oneshotVisible }: { active: boolean; oneshotVisible: boolean }) {
  if (!active) return <span className="text-gray-400 text-xs">–</span>;
  if (oneshotVisible) return <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">Jednorázové</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Pravidelné</span>;
}

export default function ProductTable({
  products: initialProducts,
  adminToken,
}: ProductTableProps) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriceKc, setNewPriceKc] = useState(0);
  const [newOneshotVisible, setNewOneshotVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriceKc, setEditPriceKc] = useState(0);
  const [editOneshotVisible, setEditOneshotVisible] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apiHeaders = {
    'Content-Type': 'application/json',
    'x-admin-token': adminToken,
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      setFeedback('Vyplňte název produktu.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          priceKc: newPriceKc,
          oneshotVisible: newOneshotVisible,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((prev) => [...prev, data.product]);
        setNewName('');
        setNewDescription('');
        setNewPriceKc(0);
        setNewOneshotVisible(false);
        setShowAddForm(false);
        setFeedback('Produkt přidán.');
      } else {
        setFeedback(data.error || 'Chyba.');
      }
    } catch {
      setFeedback('Chyba spojení.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PATCH',
        headers: apiHeaders,
        body: JSON.stringify({ active: !currentActive }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, active: !currentActive } : p)),
        );
      }
    } catch {
      setFeedback('Chyba spojení.');
    }
  };

  const startEdit = (product: ProductRow) => {
    setEditingId(product.id);
    setEditName(product.name);
    setEditDescription(product.description || '');
    setEditPriceKc(product.priceKc);
    setEditOneshotVisible(product.oneshotVisible);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      const res = await fetch(`/api/admin/products/${editingId}`, {
        method: 'PATCH',
        headers: apiHeaders,
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          priceKc: editPriceKc,
          oneshotVisible: editOneshotVisible,
        }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === editingId
              ? {
                  ...p,
                  name: editName.trim(),
                  description: editDescription.trim() || null,
                  priceKc: editPriceKc,
                  oneshotVisible: editOneshotVisible,
                }
              : p,
          ),
        );
        setEditingId(null);
        setFeedback('Produkt upraven.');
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

      {!showAddForm ? (
        <button onClick={() => setShowAddForm(true)} className="btn-primary text-sm">
          + Přidat produkt
        </button>
      ) : (
        <div className="card space-y-3">
          <input
            type="text"
            placeholder="Název produktu"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full border border-dough-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bread-400"
          />
          <input
            type="text"
            placeholder="Popis (volitelný)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full border border-dough-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bread-400"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700">Cena:</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={newPriceKc === 0 ? '' : (newPriceKc / 100).toFixed(2)}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setNewPriceKc(isNaN(val) ? 0 : Math.round(val * 100));
              }}
              className="w-32 border border-dough-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bread-400"
            />
            <span className="text-sm text-gray-500">Kč</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="newOneshotVisible"
              checked={newOneshotVisible}
              onChange={(e) => setNewOneshotVisible(e.target.checked)}
              title="Zobrazit v sekci jednorázových objednávek (produkt nebude v pravidelném katalogu)"
            />
            <label htmlFor="newOneshotVisible" className="text-sm text-gray-700 cursor-pointer">
              Jednorázové
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={loading} className="btn-primary text-sm">
              {loading ? 'Přidávám...' : 'Přidat'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewName('');
                setNewDescription('');
                setNewPriceKc(0);
                setNewOneshotVisible(false);
              }}
              className="btn-secondary text-sm"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bread-50 text-bread-800">
              <th className="text-left px-3 py-2 font-semibold">Název</th>
              <th className="text-left px-3 py-2 font-semibold">Popis</th>
              <th className="text-right px-3 py-2 font-semibold">Cena</th>
              <th className="text-center px-3 py-2 font-semibold">Sekce</th>
              <th className="text-center px-3 py-2 font-semibold">Stav</th>
              <th className="text-right px-3 py-2 font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-dough-200 hover:bg-dough-50">
                {editingId === product.id ? (
                  <>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border border-bread-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full border border-bread-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editPriceKc === 0 ? '' : (editPriceKc / 100).toFixed(2)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setEditPriceKc(isNaN(val) ? 0 : Math.round(val * 100));
                          }}
                          className="w-24 border border-bread-300 rounded px-2 py-1 text-sm text-right"
                        />
                        <span className="text-xs text-gray-500">Kč</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={editOneshotVisible}
                        onChange={(e) => setEditOneshotVisible(e.target.checked)}
                        title="Zobrazit v sekci jednorázových objednávek (produkt nebude v pravidelném katalogu)"
                      />
                      <span className="ml-1 text-xs text-gray-600">Jednorázové</span>
                    </td>
                    <td />
                    <td className="px-3 py-2 text-right">
                      <button onClick={handleSaveEdit} className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 rounded mr-1">
                        Uložit
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                        Zrušit
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-3 font-medium text-bread-900">{product.name}</td>
                    <td className="px-3 py-3 text-gray-600">{product.description || '–'}</td>
                    <td className="px-3 py-3 text-right text-gray-700">
                      {product.priceKc === 0 ? '–' : `${(product.priceKc / 100).toFixed(2)} Kč`}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <SectionBadge active={product.active} oneshotVisible={product.oneshotVisible} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          product.active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {product.active ? 'Aktivní' : 'Neaktivní'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => startEdit(product)}
                          className="px-2 py-1 text-xs bg-bread-100 hover:bg-bread-200 rounded"
                        >
                          Upravit
                        </button>
                        <button
                          onClick={() => handleToggleActive(product.id, product.active)}
                          className={`px-2 py-1 text-xs rounded ${
                            product.active
                              ? 'bg-red-100 hover:bg-red-200 text-red-700'
                              : 'bg-green-100 hover:bg-green-200 text-green-700'
                          }`}
                        >
                          {product.active ? 'Deaktivovat' : 'Aktivovat'}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {products.length === 0 && (
        <p className="text-center text-gray-500 py-8">Zatím žádné produkty.</p>
      )}
    </div>
  );
}
