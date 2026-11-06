"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PesananData, PesananEmpty } from "@/lib/analytics/pesanan";
import { todayWib, type DateRange } from "@/lib/analytics/danaRange";
import {
  PRESET_LABEL,
  STATUS_TONE,
  dayLabel,
  hourBars,
  hourLabel,
  presetRange,
  type Preset,
} from "@/lib/analytics/pesananView";
import { fmtDate, rp } from "@/lib/analytics/uploadView";
import { Card, Stat } from "./ui";

type StoreOpt = { id: string; code: string; name: string };

const PRESETS: Preset[] = ["7d", "30d", "thisMonth", "lastMonth", "all"];
const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");
const pct = (n: number | null): string =>
  n == null
    ? "–"
    : `${n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const dateInputCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:cursor-pointer";
const selectCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all";

const Th = ({ label, right = true }: { label: string; right?: boolean }) => (
  <th
    className={`py-2 px-3 font-medium text-xs text-neutral-500 whitespace-nowrap ${right ? "text-right" : "text-left"}`}
  >
    {label}
  </th>
);

export default function PesananTab({ currentUser }: { currentUser: string }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [booted, setBooted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [range, setRange] = useState<DateRange | null>(null); // null = bawaan dari server
  const [raw, setRaw] = useState<PesananData | PesananEmpty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 2. Data pesanan untuk toko dan rentang yang dipilih.
  useEffect(() => {
    if (!storeId) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ store: storeId });
        if (range) {
          qs.set("from", range.from);
          qs.set("to", range.to);
        }
        const res = await fetch(`/api/analytics/pesanan?${qs.toString()}`, {
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat data pesanan.");
          setRaw(null);
          return;
        }
        setRaw(json as PesananData | PesananEmpty);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("Gagal menghubungi server.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [storeId, range]);

  const data = raw && storeId && raw.store.id === storeId ? raw : null;
  const full = data && !data.empty ? data : null;
  const r = range ?? (full ? full.range : null);
  const bars = useMemo(() => (full ? hourBars(full.hours) : []), [full]);
  const chartData = useMemo(
    () =>
      full
        ? full.daily.map((d) => ({
            label: dayLabel(d.day),
            Valid: d.validOrders,
            Batal: d.cancelledOrders,
            // pesanan Belum Bayar (kalau ada) tidak punya batang sendiri; tampil di tabel status
          }))
        : [],
    [full],
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

      {/* Toko dan rentang tanggal */}
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
                setRange(null); // cakupan data tiap toko beda, kembali ke bawaan
                setError(null);
              }}
              className={`w-full ${selectCls}`}
            >
              <option value="">— pilih toko —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          {r && (
            <>
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                  Dari
                </label>
                <input
                  type="date"
                  value={r.from}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setRange({ from: v, to: v > r.to ? v : r.to });
                  }}
                  className={dateInputCls}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                  Sampai
                </label>
                <input
                  type="date"
                  value={r.to}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setRange({ from: v < r.from ? v : r.from, to: v });
                  }}
                  className={dateInputCls}
                />
              </div>
            </>
          )}
          {loading && (
            <Loader2
              size={16}
              className="animate-spin text-neutral-500 mb-2.5"
            />
          )}
        </div>

        {full && (
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  const next = presetRange(p, todayWib(), full.coverage);
                  if (next) setRange(next);
                }}
                className="text-xs px-2.5 py-1 rounded-full border border-line text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
            {range && (
              <button
                onClick={() => setRange(null)}
                className="text-xs px-2.5 py-1 rounded-full border border-accent-500/40 text-accent-400 hover:bg-accent-500/10 transition-colors"
              >
                Otomatis
              </button>
            )}
          </div>
        )}
        {full && full.coverage.ordersFirst && full.coverage.ordersLast && (
          <p className="text-[11px] text-neutral-500 mt-3">
            Data pesanan tersimpan: {fmtDate(full.coverage.ordersFirst)} –{" "}
            {fmtDate(full.coverage.ordersLast)}. Rentang dihitung dari tanggal
            pesanan dibuat (WIB).
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
          Pilih toko untuk melihat pesanannya.
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
        full && (
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

            {/* Angka utama */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat
                label="Pesanan"
                value={nf(full.summary.totalOrders)}
                sub={`${nf(full.summary.validOrders)} valid · ${nf(full.summary.cancelledOrders)} batal`}
              />
              <Stat
                label="Pesanan batal"
                value={pct(full.summary.cancelPct)}
                sub={
                  full.summary.cancelledAfterShip > 0
                    ? `${nf(full.summary.cancelledAfterShip)} batal setelah resi dibuat`
                    : "tidak ada yang batal setelah resi dibuat"
                }
                tone={
                  full.summary.cancelPct != null && full.summary.cancelPct >= 20
                    ? "warn"
                    : "default"
                }
              />
              <Stat
                label="Nilai pesanan valid"
                value={rp(full.summary.validGmv)}
                sub={`${nf(full.summary.validUnits)} pcs${
                  full.summary.avgOrderValue != null
                    ? ` · rata-rata ${rp(full.summary.avgOrderValue)} per pesanan`
                    : ""
                }`}
              />
              <Stat
                label="Bayar di tempat (COD)"
                value={pct(full.summary.codPct)}
                sub={`${nf(full.summary.codOrders)} pesanan`}
              />
            </div>

            {full.reading.length > 0 && (
              <Card title="Yang terlihat di data">
                <ul className="space-y-1.5">
                  {full.reading.map((t, i) => (
                    <li key={i} className="text-xs text-neutral-300">
                      {t}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Per hari */}
            <Card
              title="Pesanan per hari"
              subtitle="Valid (belum batal) dan batal, berdasarkan tanggal pesanan dibuat."
            >
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#737373", fontSize: 11 }}
                      interval="preserveStartEnd"
                      minTickGap={18}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#737373", fontSize: 11 }}
                      width={32}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      contentStyle={{
                        background: "#111",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="Valid"
                      stackId="a"
                      fill="#34d399"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="Batal"
                      stackId="a"
                      fill="#fb7185"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Status */}
              <Card
                title="Status pesanan"
                subtitle="Nilai = jumlah subtotal semua baris pesanan dengan status itu."
              >
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line">
                      <Th label="Status" right={false} />
                      <Th label="Pesanan" />
                      <Th label="Porsi" />
                      <Th label="Nilai" />
                    </tr>
                  </thead>
                  <tbody>
                    {full.status.map((s) => (
                      <tr
                        key={s.status}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="py-2 px-3">
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_TONE(s.status)}`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">{nf(s.orders)}</td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {pct(s.pct)}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {rp(s.gmv)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Pembatalan */}
              <Card
                title="Pesanan batal"
                subtitle="Siapa yang membatalkan dan alasannya."
              >
                {full.cancel.reasons.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    Tidak ada pesanan batal di rentang ini.
                  </p>
                ) : (
                  <>
                    <div className="flex gap-2 flex-wrap mb-3">
                      {full.cancel.actors.map((a) => (
                        <span
                          key={a.actor}
                          className="text-xs px-2.5 py-1 rounded-full border border-line text-neutral-300"
                        >
                          {a.actor}: {nf(a.orders)} ({pct(a.pctOfCancelled)})
                        </span>
                      ))}
                    </div>
                    <table className="w-full text-sm tabular-nums">
                      <thead>
                        <tr className="border-b border-line">
                          <Th label="Alasan" right={false} />
                          <Th label="Pesanan" />
                          <Th label="Porsi" />
                          <Th label="Setelah resi" />
                        </tr>
                      </thead>
                      <tbody>
                        {full.cancel.reasons.map((x) => (
                          <tr
                            key={`${x.actor}|${x.reason}`}
                            className="border-b border-white/5 last:border-0"
                          >
                            <td className="py-2 px-3">
                              <p className="text-neutral-100">{x.reason}</p>
                              <p className="text-[11px] text-neutral-600">
                                {x.actor}
                              </p>
                            </td>
                            <td className="py-2 px-3 text-right">
                              {nf(x.orders)}
                            </td>
                            <td className="py-2 px-3 text-right text-neutral-400">
                              {pct(x.pctOfCancelled)}
                            </td>
                            <td className="py-2 px-3 text-right text-neutral-400">
                              {x.afterShip > 0 ? nf(x.afterShip) : "–"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* Pembayaran */}
              <Card
                title="Metode pembayaran"
                subtitle="Persen batal dihitung dari pesanan di metode itu."
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-line">
                        <Th label="Metode" right={false} />
                        <Th label="Pesanan" />
                        <Th label="Porsi" />
                        <Th label="Batal" />
                        <Th label="% batal" />
                        <Th label="Setelah resi" />
                        <Th label="Nilai valid" />
                      </tr>
                    </thead>
                    <tbody>
                      {full.payment.map((p) => (
                        <tr
                          key={p.payment}
                          className="border-b border-white/5 last:border-0"
                        >
                          <td className="py-2 px-3 text-neutral-100">
                            {p.payment}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {nf(p.orders)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {pct(p.pctOfOrders)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {nf(p.cancelledOrders)}
                          </td>
                          <td
                            className={`py-2 px-3 text-right ${
                              p.cancelPct != null &&
                              full.summary.cancelPct != null &&
                              p.orders >= 20 &&
                              p.cancelPct > full.summary.cancelPct
                                ? "text-amber-400"
                                : "text-neutral-400"
                            }`}
                          >
                            {pct(p.cancelPct)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {p.cancelledAfterShip > 0
                              ? nf(p.cancelledAfterShip)
                              : "–"}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {rp(p.validGmv)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Pengiriman */}
              <Card
                title="Layanan pengiriman"
                subtitle="Bagian sebelum tanda “-” pada opsi pengiriman Shopee."
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-line">
                        <Th label="Layanan" right={false} />
                        <Th label="Pesanan" />
                        <Th label="Porsi" />
                        <Th label="Batal" />
                        <Th label="% batal" />
                        <Th label="Setelah resi" />
                      </tr>
                    </thead>
                    <tbody>
                      {full.shipping.map((s) => (
                        <tr
                          key={s.service}
                          className="border-b border-white/5 last:border-0"
                        >
                          <td className="py-2 px-3 text-neutral-100">
                            {s.service}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {nf(s.orders)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {pct(s.pctOfOrders)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {nf(s.cancelledOrders)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {pct(s.cancelPct)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {s.cancelledAfterShip > 0
                              ? nf(s.cancelledAfterShip)
                              : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Jam */}
            <Card
              title="Pesanan per jam"
              subtitle="Jam pesanan dibuat (WIB), dijumlahkan seluruh hari di rentang. Arahkan kursor ke batang untuk angkanya."
            >
              <div className="flex items-end gap-1 h-36">
                {bars.map((b) => (
                  <div
                    key={b.hour}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                    title={`${hourLabel(b.hour)}: ${nf(b.orders)} pesanan`}
                  >
                    <div
                      className="w-full rounded-t bg-accent-500/70 hover:bg-accent-400 transition-colors"
                      style={{
                        height: `${Math.max(b.heightPct, b.orders > 0 ? 2 : 0)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1.5">
                {bars.map((b) => (
                  <div
                    key={b.hour}
                    className="flex-1 text-center text-[10px] text-neutral-600"
                  >
                    {b.hour % 3 === 0 ? String(b.hour).padStart(2, "0") : ""}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
