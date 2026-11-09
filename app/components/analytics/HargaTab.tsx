"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { HargaData, HargaEmpty } from "@/lib/analytics/harga";
import {
  filterCounts,
  filterProducts,
  hintText,
  periodLabelShort,
  priceLabel,
  type HargaFilter,
} from "@/lib/analytics/hargaView";
import { rp } from "@/lib/analytics/uploadView";
import { Card, Stat } from "./ui";

type StoreOpt = { id: string; code: string; name: string };

const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");
const pct = (n: number | null): string =>
  n == null
    ? "–"
    : `${n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const rpOrDash = (n: number | null): string => (n == null ? "–" : rp(n));
const perDay = (n: number | null): string =>
  n == null
    ? "–"
    : n.toLocaleString("id-ID", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });

const inputCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all";
const chipCls = (active: boolean) =>
  `text-xs px-2.5 py-1 rounded-full border transition-colors ${
    active
      ? "border-accent-500/50 text-accent-400 bg-accent-500/10"
      : "border-line text-neutral-400 hover:text-neutral-200"
  }`;

const Th = ({ label, right = true }: { label: string; right?: boolean }) => (
  <th
    className={`py-2 px-3 font-medium text-xs text-neutral-500 whitespace-nowrap ${right ? "text-right" : "text-left"}`}
  >
    {label}
  </th>
);

export default function HargaTab({ currentUser }: { currentUser: string }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [booted, setBooted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [raw, setRaw] = useState<HargaData | HargaEmpty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<HargaFilter>("VARIASI");
  const [query, setQuery] = useState("");

  // 1. Daftar toko milik admin yang login (sekali).
  useEffect(() => {
    if (booted) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/me");
        if (cancelled) return;
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat daftar toko.");
          return;
        }
        setAdmin(json.admin);
        setStores(json.stores);
        // Satu toko saja: pilih otomatis. Lebih dari satu: dipilih sendiri supaya tidak salah toko.
        if (json.stores.length === 1) setStoreId(json.stores[0].id);
        setBooted(true);
      } catch {
        if (!cancelled) setError("Gagal menghubungi server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booted]);

  // 2. Data harga untuk toko yang dipilih.
  useEffect(() => {
    if (!storeId) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/analytics/harga?store=${storeId}`, {
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat data harga.");
          setRaw(null);
          return;
        }
        setRaw(json as HargaData | HargaEmpty);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("Gagal menghubungi server.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [storeId]);

  const data = raw && storeId && raw.store.id === storeId ? raw : null;
  const full = data && !data.empty ? data : null;
  const counts = useMemo(
    () => (full ? filterCounts(full.products) : null),
    [full],
  );
  const shown = useMemo(
    () => (full ? filterProducts(full.products, { filter, query }) : []),
    [full, filter, query],
  );

  if (sessionExpired) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 text-sm text-amber-200 max-w-xl">
        <p className="flex items-center gap-2 font-medium mb-2">
          <AlertTriangle size={16} className="shrink-0" />
          Sesi login belum berlaku untuk Analytics
        </p>
        <p className="mb-4 text-amber-200/80">
          Keluar lalu masuk lagi dengan password kamu.
        </p>
        <button
          onClick={() => {
            sessionStorage.removeItem("modiusUser");
            router.push("/");
          }}
          className="bg-accent-500 hover:bg-accent-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Masuk lagi
        </button>
      </div>
    );
  }

  return (
    <div>
      {admin && admin !== currentUser && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-sm text-amber-200">
          Sesi login di server atas nama {admin}, sedangkan halaman ini
          menampilkan {currentUser}. Keluar lalu masuk lagi supaya sama.
        </div>
      )}

      <div className="bg-panel border border-line rounded-xl p-4 mb-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[220px]">
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Toko
            </label>
            <select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setFilter("VARIASI");
                setQuery("");
                setError(null);
              }}
              className={`w-full ${inputCls}`}
            >
              <option value="">— pilih toko —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          {loading && (
            <Loader2
              size={16}
              className="animate-spin text-neutral-500 mb-2.5"
            />
          )}
        </div>
        {full && (
          <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
            Harga dikelompokkan per pita Rp5.000 dari semua pesanan yang
            tersimpan. <b>Pcs</b> adalah permintaan (termasuk yang kemudian
            batal). <b>Bersih per pcs</b> adalah sebelum iklan dan modal barang,
            dari pesanan yang dananya sudah cair. <b>Dana cair</b> adalah
            perkiraan bagian pcs valid yang dananya sudah masuk; pita di bawah{" "}
            {full.rules.minReleasedPct}% tidak dibandingkan.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-300 mb-5">
          {error}
        </div>
      )}

      {!storeId ? (
        <p className="text-sm text-neutral-500">
          Pilih toko untuk melihat harganya.
        </p>
      ) : !data ? (
        loading ? (
          <p className="text-sm text-neutral-500">Memuat…</p>
        ) : null
      ) : data.empty ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Belum ada data pesanan untuk toko ini. Upload dulu file pesanan di tab
          Upload.
        </div>
      ) : (
        full &&
        counts && (
          <div
            className={`space-y-5 ${loading ? "opacity-60 transition-opacity" : "transition-opacity"}`}
          >
            {full.warnings.length > 0 && (
              <ul className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-1.5">
                {full.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="text-xs text-amber-300 flex items-start gap-1.5"
                  >
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    {w}
                  </li>
                ))}
              </ul>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Stat
                label="Produk"
                value={nf(full.summary.products)}
                sub={`${nf(full.summary.multiBand)} pernah dijual di lebih dari satu pita harga`}
              />
              <Stat
                label="Punya saran harga lain"
                value={nf(full.summary.withHint)}
                sub={`bersih per hari pita lain minimal ${full.rules.minGainPct}% lebih tinggi`}
                tone={full.summary.withHint > 0 ? "warn" : "default"}
              />
              <Stat
                label="Syarat data cukup"
                value={`${full.rules.minDays} hari`}
                sub={`dan ${full.rules.minOrders} pesanan per pita harga`}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilter("VARIASI")}
                className={chipCls(filter === "VARIASI")}
              >
                Ada variasi harga ({counts.VARIASI})
              </button>
              {counts.SARAN > 0 && (
                <button
                  onClick={() =>
                    setFilter(filter === "SARAN" ? "VARIASI" : "SARAN")
                  }
                  className={chipCls(filter === "SARAN")}
                >
                  Punya saran ({counts.SARAN})
                </button>
              )}
              <button
                onClick={() => setFilter("SATU")}
                className={chipCls(filter === "SATU")}
              >
                Satu harga saja ({counts.SATU})
              </button>
              <button
                onClick={() => setFilter("ALL")}
                className={chipCls(filter === "ALL")}
              >
                Semua ({counts.ALL})
              </button>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama atau kode produk"
                className={`ml-auto w-56 ${inputCls} py-1.5 text-xs`}
              />
            </div>

            {shown.length === 0 && (
              <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-500">
                Tidak ada produk yang cocok dengan filter ini.
              </div>
            )}

            {shown.map((p) => {
              const cur = p.bands.find((b) => b.isCurrent);
              const hint = hintText(p);
              return (
                <Card
                  key={p.productId}
                  title={p.productName ?? "(nama belum diketahui)"}
                  subtitle={`${p.productId} · ${nf(p.totalUnits)} pcs permintaan · ${p.bands.length} pita harga${
                    cur ? ` · harga sekarang ${priceLabel(cur)}` : ""
                  }`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm tabular-nums">
                      <thead>
                        <tr className="border-b border-line">
                          <Th label="Harga" right={false} />
                          <Th label="Periode" right={false} />
                          <Th label="Hari terjual" />
                          <Th label="Pcs" />
                          <Th label="Pcs/hari" />
                          <Th label="% batal" />
                          <Th label="Dana cair" />
                          <Th label="Bersih/pcs" />
                          <Th label="Bersih/hari" />
                          <Th label="" right={false} />
                        </tr>
                      </thead>
                      <tbody>
                        {p.bands.map((b) => (
                          <tr
                            key={b.priceBand}
                            className={`border-b border-white/5 last:border-0 ${
                              b.enoughData && b.comparable ? "" : "opacity-60"
                            }`}
                          >
                            <td className="py-2 px-3 text-neutral-100 whitespace-nowrap">
                              {priceLabel(b)}
                            </td>
                            <td className="py-2 px-3 text-xs text-neutral-400 whitespace-nowrap">
                              {periodLabelShort(b.firstDay, b.lastDay)}
                            </td>
                            <td className="py-2 px-3 text-right text-neutral-400">
                              {nf(b.daysSold)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {nf(b.allUnits)}
                            </td>
                            <td className="py-2 px-3 text-right text-neutral-400">
                              {perDay(b.unitsPerDay)}
                            </td>
                            <td className="py-2 px-3 text-right text-neutral-400">
                              {pct(b.cancelPct)}
                            </td>
                            <td
                              className={`py-2 px-3 text-right ${
                                b.comparable
                                  ? "text-neutral-400"
                                  : "text-amber-300"
                              }`}
                            >
                              {pct(b.releasedPct)}
                            </td>
                            <td className="py-2 px-3 text-right text-neutral-400">
                              {rpOrDash(b.avgIncome)}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-medium ${
                                b.isBest
                                  ? "text-emerald-400"
                                  : "text-neutral-100"
                              }`}
                            >
                              {rpOrDash(b.estNetPerDay)}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className="flex gap-1">
                                {b.isCurrent && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300">
                                    Sekarang
                                  </span>
                                )}
                                {b.isBest && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                                    Bersih/hari tertinggi
                                  </span>
                                )}
                                {!b.enoughData && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-neutral-400">
                                    Data sedikit
                                  </span>
                                )}
                                {!b.comparable && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300">
                                    Dana cair sedikit
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hint && (
                    <p className="text-xs text-amber-300 mt-3 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      {hint}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
