"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Search, Package } from "lucide-react";

type StockRow = {
  id: string;
  full_name: string;
  photo_url: string | null;
  hat_model_id: string;
  material_id: string;
  color_id: string;
  logo_id: string;
  logo_type: "polos" | "bordir" | "tempel" | null;
  stock_qty: number;
};

function getStatus(qty: number) {
  if (qty <= 50)
    return { label: "Kritis", dot: "bg-red-500", text: "text-red-400" };
  if (qty <= 100)
    return { label: "Menipis", dot: "bg-amber-500", text: "text-amber-400" };
  return { label: "Aman", dot: "bg-emerald-500", text: "text-emerald-400" };
}

export default function StokLivePage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadStock() {
    const { data } = await supabase
      .from("products")
      .select(
        "id, full_name, photo_url, hat_model_id, material_id, color_id, logo_id, stock(available_qty), logos!inner(type)",
      )
      .eq("is_active", true);
    if (!data) return;

    const mapped = data.map((p: any) => {
      const stockData = Array.isArray(p.stock) ? p.stock[0] : p.stock;
      return {
        id: p.id,
        full_name: p.full_name,
        photo_url: p.photo_url,
        hat_model_id: p.hat_model_id,
        material_id: p.material_id,
        color_id: p.color_id,
        logo_id: p.logo_id,
        logo_type: p.logos?.type,
        stock_qty: stockData?.available_qty ?? 0,
      };
    });

    const polosMap = new Map<string, number>();
    mapped
      .filter((p) => p.logo_type === "polos")
      .forEach((p) => {
        polosMap.set(
          `${p.hat_model_id}|${p.material_id}|${p.color_id}`,
          p.stock_qty,
        );
      });

    const { data: pinStockData } = await supabase
      .from("pin_stock")
      .select("logo_id, available_qty");
    const pinMap = new Map<string, number>(
      (pinStockData ?? []).map((r: any) => [r.logo_id, r.available_qty]),
    );

    const final: StockRow[] = mapped.map((p) => {
      if (p.logo_type !== "tempel") return p;
      const key = `${p.hat_model_id}|${p.material_id}|${p.color_id}`;
      const polosQty = polosMap.get(key) ?? 0;
      const pinQty = pinMap.get(p.logo_id) ?? 0;
      return { ...p, stock_qty: Math.min(polosQty, pinQty) };
    });

    // Kebalikan dari Kelola Stok -- di sini yang PALING BANYAK di atas,
    // biar host langsung lihat topi mana yang aman digas duluan.
    final.sort((a, b) => b.stock_qty - a.stock_qty);
    setRows(final);
    setLoading(false);
  }

  useEffect(() => {
    loadStock();

    // Auto-update tiap ada perubahan stok (dari QC, penjualan, atau manual)
    // -- biar angka di layar host selalu segar tanpa perlu refresh.
    const channel = supabase
      .channel("stok_live_watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock" },
        () => loadStock(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pin_stock" },
        () => loadStock(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

        {loading ? (
          <p className="text-center text-sm text-neutral-600 py-12">
            Memuat...
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filtered.map((row) => {
              const status = getStatus(row.stock_qty);
              return (
                <div
                  key={row.id}
                  className="group bg-[#111318] border border-[#23262e] rounded-xl overflow-hidden hover:border-emerald-500/30 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="relative w-full aspect-video bg-[#161920] overflow-hidden">
                    {row.photo_url ? (
                      <img
                        src={row.photo_url}
                        alt={row.full_name}
                        loading="lazy"
                        className="w-full h-full object-cover image-rendering-crisp"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package
                          size={22}
                          strokeWidth={1.5}
                          className="text-neutral-600"
                        />
                      </div>
                    )}

                    {/* Efek kilau saat di-hover */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  </div>

                  {/* AREA BAWAH FOTO */}
                  <div className="p-3">
                    {/* Flex container untuk memposisikan angka stok dan badge secara sejajar */}
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-2xl font-bold tabular-nums text-neutral-50 leading-none transition-colors duration-300 group-hover:text-emerald-300">
                        {row.stock_qty}
                        <span className="text-xs font-normal text-neutral-500 ml-1.5">
                          pcs
                        </span>
                      </p>

                      {/* Badge status dipindah ke sini (Bukan absolute lagi, jadi aman di HP) */}
                      <div className="flex items-center gap-1.5 bg-[#1a1d24] border border-[#2d3139] rounded-full px-2 py-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${status.dot}`}
                        />
                        <span className="text-[10px] text-neutral-400 font-medium">
                          {status.label}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-600 truncate">
                      {row.full_name}
                    </p>
                  </div>
                </div>
              );
            })}

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
