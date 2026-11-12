"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type {
  TtPenghasilanData,
  TtPenghasilanEmpty,
} from "@/lib/analytics/ttPenghasilan";
import {
  PRESET_LABEL,
  insightLines,
  pctSigned,
  presetRange,
  type Preset,
} from "@/lib/analytics/ttPenghasilanView";
import {
  fmtDate,
  fmtPct,
  periodLabel,
  rp,
  rpSigned,
} from "@/lib/analytics/uploadView";
import { Card, Stat } from "./ui";

type StoreOpt = { id: string; code: string; name: string };
type Range = { from: string; to: string };

const PRESETS: Preset[] = ["7", "30", "month", "lastmonth", "all"];

const pct = (n: number | null): string => (n == null ? "–" : fmtPct(n));
const todayWib = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const shortDay = (iso: string): string =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const shortRp = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
    : n >= 1_000
      ? `${Math.round(n / 1_000)} rb`
      : String(Math.round(n));

const inputCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all";
const chipCls =
  "text-xs px-2.5 py-1 rounded-full border border-line text-neutral-400 hover:text-neutral-200 transition-colors";

function FlowRow({
  label,
  amount,
  pctText,
  base,
}: {
  label: string;
  amount: number;
  pctText: string;
  base: number;
}) {
  const gain = amount > 0;
  const width = base > 0 ? Math.min(100, (Math.abs(amount) / base) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs mb-1">
        <span className="text-neutral-400 truncate">{label}</span>
        <span className="tabular-nums shrink-0">
          <span className={gain ? "text-emerald-400" : "text-neutral-200"}>
            {gain ? "+" : "−"}
            {rp(Math.abs(amount))}
          </span>
          <span className="text-neutral-600 ml-2">{pctText}</span>
        </span>
      </div>
      <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${gain ? "bg-emerald-400/80" : "bg-red-400/70"}`}
          style={{ width: `${Math.max(width, 0.5)}%` }}
        />
      </div>
    </div>
  );
}

export default function TtPenghasilanTab({
  currentUser,
}: {
  currentUser: string;
}) {
  const router = useRouter();
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [booted, setBooted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [raw, setRaw] = useState<TtPenghasilanData | TtPenghasilanEmpty | null>(
    null,
  );
  const [range, setRange] = useState<Range | null>(null); // null = rentang bawaan dari server
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Daftar toko TikTok milik admin yang login (sekali).
  useEffect(() => {
    if (booted) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/me?scope=tiktok");
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

  // 2. Data penghasilan untuk toko dan rentang yang dipilih.
  useEffect(() => {
    if (!storeId) return;
    if (range && (!range.from || !range.to || range.from > range.to)) return;
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
        const res = await fetch(`/api/analytics/tt-penghasilan?${qs}`, {
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat data penghasilan.");
          setRaw(null);
          return;
        }
        setRaw(json as TtPenghasilanData | TtPenghasilanEmpty);
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
  const lines = useMemo(() => (full ? insightLines(full) : []), [full]);

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

  const shownFrom = range?.from ?? full?.range.from ?? "";
  const shownTo = range?.to ?? full?.range.to ?? "";

  const daily = full?.daily ?? [];
  const CHART_H = 140;
  const maxVal = Math.max(1, ...daily.map((d) => Math.abs(d.settlement)));
  const px = (v: number): number =>
    v === 0 ? 2 : Math.max(2, Math.round((Math.abs(v) / maxVal) * CHART_H));
  const step = Math.max(1, Math.ceil(daily.length / 14));

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
              Toko TikTok
            </label>
            <select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setRange(null);
                setRaw(null);
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
          <div>
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Dana dilepas dari
            </label>
            <input
              type="date"
              value={shownFrom}
              disabled={!full}
              onChange={(e) => setRange({ from: e.target.value, to: shownTo })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Sampai
            </label>
            <input
              type="date"
              value={shownTo}
              disabled={!full}
              onChange={(e) =>
                setRange({ from: shownFrom, to: e.target.value })
              }
              className={inputCls}
            />
          </div>
          {loading && (
            <Loader2
              size={16}
              className="animate-spin text-neutral-500 mb-2.5"
            />
          )}
        </div>
        {full && (
          <div className="flex gap-2 flex-wrap mt-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={chipCls}
                onClick={() => {
                  const r = presetRange(p, full.coverage, todayWib());
                  if (r) setRange(r);
                }}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        {full && (
          <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
            Penghasilan tersimpan:{" "}
            {periodLabel({
              start: full.coverage.incomeFirst ?? full.range.from,
              end: full.coverage.incomeLast ?? full.range.to,
            })}
            . Rentang dihitung dari tanggal <b>dana dilepas</b>, bukan tanggal
            pesanan dibuat. Biaya negatif (−) adalah potongan; angka positif
            adalah pemasukan.
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
          Pilih toko untuk melihat penghasilannya.
        </p>
      ) : !data ? (
        loading ? (
          <p className="text-sm text-neutral-500">Memuat…</p>
        ) : null
      ) : data.empty ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Belum ada data penghasilan untuk toko ini. Upload file income TikTok
          di tab Upload.
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

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Stat
                label="Pendapatan"
                value={rp(full.summary.revenue)}
                sub={`${rp(full.summary.subtotalAfter)} penjualan − ${rp(-full.summary.refundAfter)} dikembalikan`}
              />
              <Stat
                label="Potongan platform"
                value={rpSigned(full.summary.totalFee)}
                sub={`${pct(full.rates.feePct)} dari pendapatan`}
              />
              <Stat
                label="Iklan (GMV Pay)"
                value={rpSigned(full.summary.adsCost)}
                sub={`${pct(full.rates.adsPct)} dari pendapatan`}
              />
              <Stat
                label="Dana bersih"
                value={rp(full.summary.settlement)}
                sub={`${pct(full.rates.netPct)} dari pendapatan`}
              />
              <Stat
                label="Per pesanan berdana"
                value={
                  full.perOrder.afterAds == null
                    ? "–"
                    : rp(full.perOrder.afterAds)
                }
                sub={`setelah iklan · sebelum iklan ${
                  full.perOrder.beforeAds == null
                    ? "–"
                    : rp(full.perOrder.beforeAds)
                } · ${full.qty.ordersWithFunds} pesanan berdana${
                  full.perOrder.afterAdsPerPcs != null
                    ? ` · perkiraan ${rp(full.perOrder.afterAdsPerPcs)} per pcs`
                    : ""
                }`}
              />
              <Stat
                label="Dana menunggu cair"
                value={`${full.pending.orders} pesanan`}
                sub={`nilai ${rp(full.pending.subtotal)}${
                  full.pending.oldest
                    ? ` · tertua dibuat ${fmtDate(full.pending.oldest)}`
                    : ""
                }`}
                tone={full.pending.orders > 0 ? "warn" : "default"}
              />
            </div>

            <Card
              title="Yang terlihat di data"
              subtitle={`Dana dilepas ${periodLabel({ start: full.range.from, end: full.range.to })}`}
            >
              <ul className="space-y-1.5 text-sm text-neutral-300">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </Card>

            <Card
              title="Ke mana uang pergi"
              subtitle="Dari penjualan sampai dana bersih. Persen biaya terhadap pendapatan."
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-200 font-medium">
                    Penjualan setelah diskon penjual
                  </span>
                  <span className="tabular-nums text-neutral-50 font-semibold">
                    {rp(full.summary.subtotalAfter)}
                  </span>
                </div>

                <FlowRow
                  label="Dikembalikan ke pembeli"
                  amount={full.summary.refundAfter}
                  pctText={`${pct(full.rates.refundPct)} dari penjualan`}
                  base={full.summary.subtotalAfter}
                />

                <div className="flex items-center justify-between text-sm border-t-2 border-white/20 pt-3">
                  <span className="text-neutral-200 font-medium">
                    Pendapatan
                  </span>
                  <span className="tabular-nums text-neutral-50 font-semibold">
                    {rp(full.summary.revenue)}
                  </span>
                </div>

                {full.breakdown.map((b) => (
                  <FlowRow
                    key={b.key}
                    label={b.label}
                    amount={b.amount}
                    pctText={pctSigned(b.pctOfRevenue)}
                    base={full.summary.revenue}
                  />
                ))}

                <FlowRow
                  label="Iklan (potongan GMV Pay)"
                  amount={full.summary.adsCost}
                  pctText={pctSigned(
                    full.rates.adsPct == null ? null : -full.rates.adsPct,
                  )}
                  base={full.summary.revenue}
                />

                {full.summary.otherAdjustment !== 0 && (
                  <FlowRow
                    label="Penyesuaian lain (mis. subsidi platform)"
                    amount={full.summary.otherAdjustment}
                    pctText={pctSigned(
                      full.summary.revenue === 0
                        ? null
                        : (100 * full.summary.otherAdjustment) /
                            full.summary.revenue,
                    )}
                    base={full.summary.revenue}
                  />
                )}

                <div className="flex items-center justify-between text-sm border-t-2 border-white/20 pt-3">
                  <span className="text-neutral-200 font-medium">
                    Dana bersih{" "}
                    <span className="text-neutral-500 text-xs font-normal">
                      ({pct(full.rates.netPct)} dari pendapatan)
                    </span>
                  </span>
                  <span className="tabular-nums text-emerald-400 font-semibold">
                    {rp(full.summary.settlement)}
                  </span>
                </div>

                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  Dana bersih belum dikurangi modal barang. Komisi dinamis dan
                  komisi afiliasi tergantung kreator dan program yang aktif;
                  ongkir bersih sudah memperhitungkan subsidi ongkir.
                </p>
              </div>
            </Card>

            <Card
              title="Dana per hari"
              subtitle="Dana bersih menurut tanggal dilepas. Batang merah = hari yang hanya kena potongan iklan (dana negatif). Garis abu-abu tipis = tidak ada dana."
            >
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${daily.length * 10 + 48}px` }}>
                  <div className="flex pt-2">
                    {/* sumbu kiri */}
                    <div
                      className="relative w-12 shrink-0 text-[10px] text-neutral-500"
                      style={{ height: CHART_H }}
                    >
                      {[
                        { y: 0, v: maxVal },
                        { y: CHART_H / 2, v: maxVal / 2 },
                        { y: CHART_H, v: 0 },
                      ].map((t) => (
                        <span
                          key={t.y}
                          className="absolute right-2 -translate-y-1/2 tabular-nums"
                          style={{ top: t.y }}
                        >
                          {shortRp(t.v)}
                        </span>
                      ))}
                    </div>

                    {/* area batang */}
                    <div
                      className="relative flex-1"
                      style={{ height: CHART_H }}
                    >
                      {[0, CHART_H / 2, CHART_H].map((y) => (
                        <div
                          key={y}
                          className={`absolute left-0 right-0 border-t ${
                            y === CHART_H
                              ? "border-white/30"
                              : "border-white/10"
                          }`}
                          style={{ top: y }}
                        />
                      ))}
                      <div className="absolute inset-0 flex gap-[3px]">
                        {daily.map((d) => (
                          <div
                            key={d.day}
                            className="flex-1 min-w-0 flex items-end"
                            title={`${fmtDate(d.day)} · ${rpSigned(d.settlement)} · ${d.orders} pesanan`}
                          >
                            <div
                              className={`w-full rounded-t-sm ${
                                d.settlement < 0
                                  ? "bg-rose-400"
                                  : d.settlement > 0
                                    ? "bg-emerald-400"
                                    : "bg-white/15"
                              }`}
                              style={{ height: px(d.settlement) }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* tanggal di bawah */}
                  <div className="relative ml-12 h-5 mt-1 text-[10px] text-neutral-500">
                    {daily.map((d, i) =>
                      i % step === 0 ? (
                        <span
                          key={d.day}
                          className="absolute -translate-x-1/2 whitespace-nowrap"
                          style={{
                            left: `${((i + 0.5) / daily.length) * 100}%`,
                          }}
                        >
                          {shortDay(d.day)}
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
              </div>

              {/* legenda */}
              <div className="flex justify-center gap-4 mt-2 text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />{" "}
                  Potongan iklan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />{" "}
                  Dana masuk
                </span>
              </div>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
