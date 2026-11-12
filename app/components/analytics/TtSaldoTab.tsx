"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { TtSaldoData, TtSaldoEmpty } from "@/lib/analytics/ttSaldo";
import {
  PRESET_LABEL,
  insightLines,
  presetRange,
  type Preset,
} from "@/lib/analytics/ttSaldoView";
import { fmtDate, periodLabel, rp, rpSigned } from "@/lib/analytics/uploadView";
import { Card, Stat } from "./ui";

type StoreOpt = { id: string; code: string; name: string };
type Range = { from: string; to: string };

const PRESETS: Preset[] = ["7", "30", "month", "lastmonth", "all"];

const todayWib = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

const inputCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all";
const chipCls =
  "text-xs px-2.5 py-1 rounded-full border border-line text-neutral-400 hover:text-neutral-200 transition-colors";

const Th = ({ label, right = true }: { label: string; right?: boolean }) => (
  <th
    className={`py-2 px-3 font-medium text-xs text-neutral-500 whitespace-nowrap ${right ? "text-right" : "text-left"}`}
  >
    {label}
  </th>
);

export default function TtSaldoTab({ currentUser }: { currentUser: string }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [booted, setBooted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [raw, setRaw] = useState<TtSaldoData | TtSaldoEmpty | null>(null);
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

  // 2. Data saldo untuk toko dan rentang yang dipilih.
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
        const res = await fetch(`/api/analytics/tt-saldo?${qs}`, {
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat data saldo.");
          setRaw(null);
          return;
        }
        setRaw(json as TtSaldoData | TtSaldoEmpty);
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
  const s = full?.summary;
  const v = full?.derived;

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
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Tanggal transaksi dari
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
                  const rg = presetRange(p, full.coverage, todayWib());
                  if (rg) setRange(rg);
                }}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        {full && (
          <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
            Data saldo tersimpan:{" "}
            {periodLabel({
              start: full.coverage.walletFirst,
              end: full.coverage.walletLast,
            })}
            . Rentang dihitung dari <b>tanggal transaksi</b> di Riwayat
            penarikan. File TikTok tidak memuat saldo, jadi yang tampil adalah
            arus dana selama periode, bukan saldo yang tersisa.
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
          Pilih toko untuk melihat saldonya.
        </p>
      ) : !data ? (
        loading ? (
          <p className="text-sm text-neutral-500">Memuat…</p>
        ) : null
      ) : data.empty ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Belum ada data saldo untuk toko ini. Upload file income TikTok di tab
          Upload (riwayat penarikan ada di file yang sama).
        </div>
      ) : (
        full &&
        s &&
        v && (
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
                label="Dana masuk (Earnings)"
                value={rp(s.earnings)}
                sub={`${s.earningsCount} kali pencairan dana pesanan`}
              />
              <Stat
                label="Potongan iklan (GMV Pay)"
                value={rpSigned(s.adsDeduction)}
                sub="dipotong langsung dari saldo"
              />
              <Stat
                label="Dana bersih masuk"
                value={rp(v.netIncome)}
                sub="dana masuk − potongan iklan"
              />
              <Stat
                label="Total ditarik"
                value={rp(v.withdrawn)}
                sub={`${s.withdrawalCount} kali penarikan${
                  v.avgGapDays != null
                    ? ` · rata-rata tiap ${v.avgGapDays.toFixed(1).replace(".", ",")} hari`
                    : ""
                }`}
              />
              <Stat
                label="Rata-rata per penarikan"
                value={v.avgWithdrawal == null ? "–" : rp(v.avgWithdrawal)}
                sub={`terbesar ${rp(s.largestWithdrawal)}`}
              />
              <Stat
                label="Selisih periode"
                value={rpSigned(s.netChange)}
                sub="dana masuk − iklan − penarikan"
                tone={s.netChange < 0 ? "warn" : "default"}
              />
            </div>

            <Card
              title="Yang terlihat di data"
              subtitle={`Transaksi ${periodLabel({ start: full.range.from, end: full.range.to })}`}
            >
              <ul className="space-y-1.5 text-sm text-neutral-300">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </Card>

            <Card
              title="Riwayat penarikan"
              subtitle="Uang yang ditarik dari saldo TikTok ke rekening bank. Terbaru di atas. Nomor rekening tidak disimpan."
            >
              {full.withdrawals.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Tidak ada penarikan di rentang ini.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-line">
                        <Th label="Tanggal permintaan" right={false} />
                        <Th label="Jumlah ditarik" />
                        <Th label="Status" right={false} />
                        <Th label="Berhasil" right={false} />
                        <Th label="ID referensi" right={false} />
                      </tr>
                    </thead>
                    <tbody>
                      {full.withdrawals.map((w) => (
                        <tr
                          key={w.refId}
                          className="border-b border-white/5 text-neutral-300"
                        >
                          <td className="py-2 px-3">
                            {fmtDate(w.requestedOn)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {rp(Math.abs(w.amount))}
                          </td>
                          <td className="py-2 px-3">{w.status ?? "–"}</td>
                          <td className="py-2 px-3">
                            {w.doneOn ? fmtDate(w.doneOn) : "–"}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-neutral-500">
                            {w.refId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )
      )}
    </div>
  );
}
