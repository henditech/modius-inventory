"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { StockCard, useLiveStock } from "../components/LiveStock";

export default function StokLivePage() {
  const { rows, loading, error } = useLiveStock();
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-neutral-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          Real Stock
        </h1>

        <p className="text-sm text-neutral-500 mb-5">
          Total items currently available in inventory.
        </p>

        <div className="relative mb-5 max-w-md">
          <Search
            size={16}
            strokeWidth={1.75}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama topi..."
            className="w-full bg-[#111318] border border-[#23262e] rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 mb-4 text-sm text-red-300">
            Data gagal dimuat: {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-sm text-neutral-600 py-12">
            Memuat...
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filtered.map((row) => (
              <StockCard key={row.id} row={row} />
            ))}

            {filtered.length === 0 && (
              <p className="col-span-full text-center text-sm text-neutral-600 py-12">
                Gak ada produk yang cocok.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
