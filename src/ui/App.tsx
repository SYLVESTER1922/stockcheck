import { useState } from 'react';
import { loadExport, type Item } from '../domain/export';

export function App() {
  const [items, setItems] = useState<Item[]>([]);

  async function onFile(file: File) {
    setItems(loadExport(await file.arrayBuffer()));
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-lg font-bold">StockCheck</h1>
      <label className="mt-4 block text-sm font-medium">
        Zobaze Export
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="mt-1 block w-full text-sm"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      {items.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th>Item</th>
              <th>Variant</th>
              <th className="text-right">Expected</th>
              <th className="text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t border-slate-200">
                <td>{item.name}</td>
                <td>{item.variant}</td>
                <td className="text-right tabular-nums">{item.expected}</td>
                <td className="text-right tabular-nums">{item.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
