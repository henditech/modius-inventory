"use client";

import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type StockRow = {
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

export type PinRow = { id: string; name: string; available_qty: number };

export function getStatus(qty: number) {
  if (qty <= 50)
    return { label: "Kritis", dot: "bg-red-500", text: "text-red-400" };
  if (qty <= 100)
    return { label: "Menipis", dot: "bg-amber-500", text: "text-amber-400" };
  return { label: "Aman", dot: "bg-emerald-500", text: "text-emerald-400" };
}

// Data stok live: topi (polos, bordir, dan tempel/virtual) + stok pin.
// Auto-update lewat realtime tiap ada perubahan di tabel stock / pin_stock.
export function useLiveStock() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestIdRef = useRef(0);

  async function loadStock() {
    const myRequest = ++requestIdRef.current;

    const [productsRes, pinsRes] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, full_name, photo_url, hat_model_id, material_id, color_id, logo_id, stock(available_qty), logos!inner(type)",
        )
        .eq("is_active", true),
      supabase
        .from("logos")
        .select("id, name, pin_stock(available_qty)")
        .eq("type", "tempel"),
    ]);

    // Abaikan hasil kalau sudah ada permintaan yang lebih baru
    // (realtime bisa memicu beberapa load berurutan).
    if (myRequest !== requestIdRef.current) return;

    const failure = productsRes.error ?? pinsRes.error;
    if (failure) {
      setError(failure.message);
      setLoading(false);
      return;
    }

    const mapped = (productsRes.data ?? []).map((p: any) => {
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

    const pinRows: PinRow[] = (pinsRes.data ?? []).map((p: any) => {
      const stockRow = Array.isArray(p.pin_stock)
        ? p.pin_stock[0]
        : p.pin_stock;
      return {
        id: p.id,
        name: p.name,
        available_qty: stockRow?.available_qty ?? 0,
      };
    });
    const pinMap = new Map<string, number>(
      pinRows.map((p) => [p.id, p.available_qty] as [string, number]),
    );

    const polosMap = new Map<string, number>();
    mapped
      .filter((p) => p.logo_type === "polos")
      .forEach((p) => {
        polosMap.set(
          `${p.hat_model_id}|${p.material_id}|${p.color_id}`,
          p.stock_qty,
        );
      });

    // Stok virtual (topi tempel) = yang paling sedikit antara topi polos
    // dan pin-nya.
    const final: StockRow[] = mapped.map((p) => {
      if (p.logo_type !== "tempel") return p;
      const key = `${p.hat_model_id}|${p.material_id}|${p.color_id}`;
      const polosQty = polosMap.get(key) ?? 0;
      const pinQty = pinMap.get(p.logo_id) ?? 0;
      return { ...p, stock_qty: Math.min(polosQty, pinQty) };
    });

    // Yang PALING BANYAK di atas, biar host langsung lihat topi mana yang
    // aman digas duluan.
    final.sort((a, b) => b.stock_qty - a.stock_qty);
    pinRows.sort(
      (a, b) =>
        b.available_qty - a.available_qty || a.name.localeCompare(b.name),
    );

    setRows(final);
    setPins(pinRows);
    setError(null);
    setUpdatedAt(new Date());
    setLoading(false);
  }

  useEffect(() => {
    loadStock();

    // Auto-update tiap ada perubahan stok (dari QC, penjualan, atau manual)
    // -- biar angka di layar selalu segar tanpa perlu refresh.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rows, pins, loading, error, updatedAt };
}

export function StockCard({ row }: { row: StockRow }) {
  const status = getStatus(row.stock_qty);
  return (
    <div className="group bg-[#111318] border border-[#23262e] rounded-xl overflow-hidden hover:border-emerald-500/30 hover:-translate-y-1 transition-all duration-300">
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
            <Package size={22} strokeWidth={1.5} className="text-neutral-600" />
          </div>
        )}

        {/* Efek kilau saat di-hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      </div>

      {/* AREA BAWAH FOTO */}
      <div className="p-3">
        {/* Angka stok dan badge status sejajar (bukan absolute, jadi aman di HP) */}
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-2xl font-bold tabular-nums text-neutral-50 leading-none transition-colors duration-300 group-hover:text-emerald-300">
            {row.stock_qty}
            <span className="text-xs font-normal text-neutral-500 ml-1.5">
              pcs
            </span>
          </p>

          <div className="flex items-center gap-1.5 bg-[#1a1d24] border border-[#2d3139] rounded-full px-2 py-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <span className="text-[10px] text-neutral-400 font-medium">
              {status.label}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-neutral-600 truncate">{row.full_name}</p>
      </div>
    </div>
  );
}

// Pin tidak punya ambang status (kritis/menipis) di admin, jadi di sini
// hanya nama dan jumlahnya.
export function PinCard({ pin }: { pin: PinRow }) {
  return (
    <div className="group bg-[#111318] border border-[#23262e] rounded-xl px-4 py-3.5 hover:border-emerald-500/30 hover:-translate-y-1 transition-all duration-300">
      <p className="text-xs text-neutral-500 truncate mb-1.5">{pin.name}</p>
      <p className="text-2xl font-bold tabular-nums text-neutral-50 leading-none transition-colors duration-300 group-hover:text-emerald-300">
        {pin.available_qty}
        <span className="text-xs font-normal text-neutral-500 ml-1.5">
          pcs baik
        </span>
      </p>
    </div>
  );
}
