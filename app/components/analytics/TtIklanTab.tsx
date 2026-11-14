"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { TtIklanData, TtIklanEmpty } from "@/lib/analytics/ttIklan";
import {
  PRESET_LABEL,
  insightLines,
  presetRange,
  roiTxt,
  type Preset,
} from "@/lib/analytics/ttIklanView";
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

export default function TtIklanTab({ currentUser }: { currentUser: string }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [booted, setBooted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [raw, setRaw] = useState<TtIklanData | TtIklanEmpty | null>(null);
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

  // 2. Data iklan untuk toko dan rentang yang dipilih.
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
        const res = await fetch(`/api/analytics/tt-iklan?${qs}`, {
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat data iklan.");
          setRaw(null);
          return;
        }
        setRaw(json as TtIklanData | TtIklanEmpty);
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
  const idle = useMemo(
    () =>
      full ? full.daily.filter((d) => d.cost > 0 && d.skuOrders === 0) : [],
    [full],
  );
  const idleCost = idle.reduce((a, d) => a + d.cost, 0);

  // Rincian per kampanye (dari file Product campaign). Kampanye tanpa biaya di rentang ini
  // tidak masuk tabel, hanya disebut namanya. "Perlu dicek" = ada biaya tapi tidak ada pesanan
  // yang diklaim iklan, atau ROI klaim iklan di bawah 1.
  const camps = full?.campaigns ?? [];
  const activeCamps = camps.filter((c) => c.cost > 0);
  const quietCamps = camps.filter((c) => c.cost === 0);
  const campCost = activeCamps.reduce((a, c) => a + c.cost, 0);
  const weakCamps = activeCamps.filter(
    (c) => c.skuOrders === 0 || (c.roi ?? 0) < 1,
  );
  const weakCost = weakCamps.reduce((a, c) => a + c.cost, 0);
  const weakOrders = weakCamps.reduce((a, c) => a + c.skuOrders, 0);

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
  const cmp = full?.compare ?? null;

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
              Tanggal iklan dari
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
            Data iklan tersimpan:{" "}
            {periodLabel({
              start: full.coverage.adsFirst,
              end: full.coverage.adsLast,
            })}
            . Rentang dihitung dari <b>tanggal iklan</b> (file Product campaign
            atau Campaign overview), bukan tanggal dana dilepas.
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
          Pilih toko untuk melihat iklannya.
        </p>
      ) : !data ? (
        loading ? (
          <p className="text-sm text-neutral-500">Memuat…</p>
        ) : null
      ) : data.empty ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Belum ada data iklan untuk toko ini. Upload file Product campaign
          TikTok di tab Upload.
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
                label="Biaya iklan"
                value={rp(full.summary.cost)}
                sub={`${full.summary.activeDays} hari aktif dari ${full.summary.days} hari data`}
              />
              <Stat
                label="Pesanan diklaim iklan"
                value={`${full.summary.skuOrders}`}
                sub="pesanan SKU · batas atas"
              />
              <Stat
                label="Penghasilan bruto diklaim iklan"
                value={rp(full.summary.grossRevenue)}
                sub="sebelum pengembalian dan potongan platform"
              />
              <Stat
                label="ROI (klaim iklan)"
                value={roiTxt(full.summary.roi)}
                sub="penghasilan bruto ÷ biaya iklan"
              />
              <Stat
                label="Biaya per pesanan"
                value={
                  full.summary.costPerOrder == null
                    ? "–"
                    : rp(full.summary.costPerOrder)
                }
                sub="biaya iklan ÷ pesanan diklaim iklan"
              />
              <Stat
                label="Hari biaya tanpa pesanan"
                value={`${idle.length} hari`}
                sub={
                  idle.length > 0
                    ? `biaya ${rp(idleCost)} tanpa pesanan terklaim`
                    : "tidak ada"
                }
                tone={idle.length > 0 ? "warn" : "default"}
              />
            </div>

            <Card
              title="Yang terlihat di data"
              subtitle={`Tanggal iklan ${periodLabel({ start: full.range.from, end: full.range.to })}`}
            >
              <ul className="space-y-1.5 text-sm text-neutral-300">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </Card>

            {activeCamps.length > 0 && (
              <Card
                title="Iklan per kampanye"
                subtitle="Dari file Product campaign. TikTok hanya memberi biaya sampai tingkat kampanye, bukan per produk."
              >
                {weakCamps.length > 0 && campCost > 0 && (
                  <p className="text-sm text-amber-300 mb-3 leading-relaxed">
                    {weakCamps.length} dari {activeCamps.length} kampanye
                    berbiaya perlu dicek (tanpa pesanan atau ROI di bawah 1):{" "}
                    {weakCamps.map((c) => c.name).join(", ")}. Biayanya{" "}
                    {rp(weakCost)} ({fmtPct((weakCost / campCost) * 100)} dari
                    biaya kampanye) dengan {weakOrders} pesanan diklaim iklan.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-line">
                        <Th label="Kampanye" right={false} />
                        <Th label="Hari aktif" />
                        <Th label="Biaya" />
                        <Th label="Porsi biaya" />
                        <Th label="Pesanan" />
                        <Th label="Biaya per pesanan" />
                        <Th label="Penghasilan bruto" />
                        <Th label="ROI" />
                      </tr>
                    </thead>
                    <tbody>
                      {activeCamps.map((c) => {
                        const tone =
                          c.skuOrders === 0
                            ? "text-red-300"
                            : (c.roi ?? 0) < 1
                              ? "text-amber-300"
                              : "text-neutral-300";
                        return (
                          <tr
                            key={c.id}
                            className={`border-b border-white/5 ${tone}`}
                          >
                            <td className="py-2 px-3">{c.name}</td>
                            <td className="py-2 px-3 text-right">
                              {c.activeDays}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {rp(c.cost)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {campCost > 0
                                ? fmtPct((c.cost / campCost) * 100)
                                : "–"}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {c.skuOrders}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {c.costPerOrder == null
                                ? "–"
                                : rp(c.costPerOrder)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {rp(c.grossRevenue)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {roiTxt(c.roi)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {quietCamps.length > 0 && (
                  <p className="text-[11px] text-neutral-500 mt-3">
                    Tanpa biaya di rentang ini:{" "}
                    {quietCamps.map((c) => c.name).join(", ")}.
                  </p>
                )}
                <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                  Merah = ada biaya tapi tidak ada pesanan yang diklaim iklan.
                  Kuning = ROI di bawah 1. ROI di sini adalah penghasilan bruto
                  ÷ biaya iklan (klaim iklan), belum dikurangi modal barang dan
                  potongan platform, jadi ROI di atas 1 belum tentu untung.
                  Kampanye dengan sedikit hari atau sedikit pesanan belum cukup
                  untuk disimpulkan.
                </p>
              </Card>
            )}
            {full.campaigns &&
              full.campaigns.length === 0 &&
              full.summary.cost > 0 && (
                <p className="text-xs text-neutral-500">
                  Belum ada rincian per kampanye untuk rentang ini. Upload file
                  Product campaign di tab Upload untuk melihatnya.
                </p>
              )}

            {cmp && full.summary.cost > 0 && (
              <Card
                title="Iklan vs uang yang benar-benar masuk"
                subtitle="Dibandingkan per periode, memakai data dari tab Penghasilan"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <tbody>
                      <tr className="border-b border-white/5">
                        <td className="py-2 px-3 text-neutral-300">
                          Biaya iklan (data iklan TikTok)
                        </td>
                        <td className="py-2 px-3 text-right">
                          {rp(full.summary.cost)}
                        </td>
                      </tr>
                      <tr className="border-b border-white/5">
                        <td className="py-2 px-3 text-neutral-300">
                          Potongan iklan GMV Pay (file income)
                        </td>
                        <td className="py-2 px-3 text-right">
                          {rpSigned(cmp.adsCostIncome)}
                        </td>
                      </tr>
                      <tr className="border-b border-white/5">
                        <td className="py-2 px-3 text-neutral-300">
                          Dana bersih dari pesanan, sebelum iklan
                        </td>
                        <td className="py-2 px-3 text-right">
                          {rp(cmp.ordersSettlement)}
                        </td>
                      </tr>
                      <tr className="border-b border-white/5">
                        <td className="py-2 px-3 text-neutral-300">
                          Dana bersih setelah iklan
                        </td>
                        <td className="py-2 px-3 text-right">
                          {rp(cmp.settlement)}
                        </td>
                      </tr>
                      <tr className="font-medium">
                        <td className="py-2 px-3 text-neutral-100">
                          Dana pesanan per Rp1 biaya iklan
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-100">
                          {(cmp.ordersSettlement / full.summary.cost)
                            .toFixed(2)
                            .replace(".", ",")}
                          ×
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
                  Iklan dihitung per tanggal iklan, sedangkan dana per tanggal
                  dilepas, jadi perbandingan ini paling akurat untuk rentang
                  satu bulan penuh. Angkanya untuk seluruh toko (termasuk
                  pesanan organik), dan dana bersih belum dikurangi modal
                  barang: nilai di atas 1× belum tentu berarti untung.
                </p>
              </Card>
            )}

            <Card
              title="Iklan per hari"
              subtitle="Merah = hari ada biaya iklan tapi tidak ada pesanan yang diklaim iklan."
            >
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line">
                      <Th label="Tanggal" right={false} />
                      <Th label="Biaya" />
                      <Th label="Pesanan" />
                      <Th label="Biaya per pesanan" />
                      <Th label="Penghasilan bruto" />
                      <Th label="ROI" />
                    </tr>
                  </thead>
                  <tbody>
                    {full.daily.map((d) => {
                      const isIdle = d.cost > 0 && d.skuOrders === 0;
                      return (
                        <tr
                          key={d.day}
                          className={`border-b border-white/5 ${isIdle ? "text-red-300" : "text-neutral-300"}`}
                        >
                          <td className="py-2 px-3">{fmtDate(d.day)}</td>
                          <td className="py-2 px-3 text-right">{rp(d.cost)}</td>
                          <td className="py-2 px-3 text-right">
                            {d.skuOrders}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {d.skuOrders > 0 ? rp(d.cost / d.skuOrders) : "–"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {rp(d.grossRevenue)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {roiTxt(d.roi)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
