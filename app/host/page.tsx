"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import AdminThemeStyles from "../components/AdminTheme";
import CatatanPenjualanSection from "../components/CatatanPenjualanSection";
import { DialogProvider } from "../components/ConfirmDialog";
import { PinCard, StockCard, useLiveStock } from "../components/LiveStock";

// Halaman host: hanya untuk dilihat (tanpa tombol aksi) dan tanpa login.
// Toko yang tampil di tab Pesanan = toko yang dikelola orang ini.
const HOST_STORE_OWNER = "Gita";

type Tab = "bordir" | "polos" | "pin" | "pesanan";

const TABS: { id: Tab; label: string }[] = [
  { id: "bordir", label: "Topi Bordir" },
  { id: "polos", label: "Topi Polos" },
  { id: "pin", label: "Pin" },
  { id: "pesanan", label: "Pesanan" },
];

// Stok virtual (topi tempel) sengaja tidak punya tab: angkanya sudah
// terwakili oleh stok topi polos dan stok pin.

function formatTime(d: Date) {
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default function HostPage() {
  const [tab, setTab] = useState<Tab>("bordir");
  const [search, setSearch] = useState("");
  const { rows, pins, loading, error, updatedAt } = useLiveStock();

  const q = search.trim().toLowerCase();
  const isStockTab = tab !== "pesanan";

  const logoType =
    tab === "bordir" ? "bordir" : tab === "polos" ? "polos" : null;
  const topiList = logoType
    ? rows.filter(
        (r) =>
          r.logo_type === logoType && r.full_name.toLowerCase().includes(q),
      )
    : [];
  const pinList = pins.filter((p) => p.name.toLowerCase().includes(q));

  const count = tab === "pin" ? pinList.length : topiList.length;
  const totalQty =
    tab === "pin"
      ? pinList.reduce((sum, p) => sum + p.available_qty, 0)
      : topiList.reduce((sum, r) => sum + r.stock_qty, 0);

  return (
    // CatatanPenjualanSection memanggil useConfirm() (dipakai tombol aksi di
    // admin), jadi butuh provider walau tombolnya disembunyikan di sini.
    <DialogProvider>
      <div className="min-h-screen bg-[#0a0b0e] text-neutral-100 p-4 md:p-8">
        <AdminThemeStyles />
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Host Live
          </h1>
          <p className="text-sm text-neutral-500 mb-5">
            Pantau stok dan status pesanan.
            {updatedAt &&
              isStockTab &&
              ` Stok diperbarui ${formatTime(updatedAt)}.`}
          </p>

          {/* Tab */}
          <div className="flex gap-1 mb-5 border-b border-line overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "border-accent-400 text-accent-400"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {isStockTab && (
            <>
              <div className="relative mb-4 max-w-md">
                <Search
                  size={16}
                  strokeWidth={1.75}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === "pin" ? "Cari nama pin..." : "Cari nama topi..."
                  }
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
                <>
                  <p className="text-xs text-neutral-500 mb-3 tabular-nums">
                    {count} item · {totalQty} pcs
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                    {tab === "pin"
                      ? pinList.map((p) => <PinCard key={p.id} pin={p} />)
                      : topiList.map((r) => <StockCard key={r.id} row={r} />)}

                    {count === 0 && (
                      <p className="col-span-full text-center text-sm text-neutral-600 py-12">
                        {q ? "Gak ada yang cocok." : "Belum ada data."}
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {tab === "pesanan" && (
            <CatatanPenjualanSection currentUser={HOST_STORE_OWNER} readOnly />
          )}
        </div>
      </div>
    </DialogProvider>
  );
}
