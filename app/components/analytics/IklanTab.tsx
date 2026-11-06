"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import type { ChannelStat, IklanData, IklanEmpty } from "@/lib/analytics/iklan";
import {
  AD_STATUS_TONE,
  FLAG_LABEL,
  FLAG_ORDER,
  FLAG_TONE,
  VERDICT_LABEL,
  VERDICT_ORDER,
  VERDICT_RULES,
  VERDICT_TONE,
  adVerdict,
  filterCounts,
  filterSortProducts,
  verdictCounts,
  type IklanFilter,
  type IklanSortKey,
  type SortDir,
} from "@/lib/analytics/iklanView";
import { periodLabel, rp, rpSigned } from "@/lib/analytics/uploadView";
import { Card, Stat } from "./ui";

type StoreOpt = { id: string; code: string; name: string };

const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");
const pct = (n: number | null): string =>
  n == null
    ? "–"
    : `${n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const rpOrDash = (n: number | null): string => (n == null ? "–" : rp(n));
const x2 = (n: number | null): string =>
  n == null
    ? "–"
    : n.toLocaleString("id-ID", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const inputCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all";

const CHANNEL_LABEL: Record<string, string> = {
  individual: "Iklan individual",
  otomatis: "Iklan Produk Otomatis",
  total: "Gabungan",
};

export default function IklanTab({ currentUser }: { currentUser: string }) {
  const router = useRouter();

  // ---------------------------------------------------------------- toko dan data
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [booted, setBooted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(
    null,
  ); // null = periode iklan terbaru (ditentukan server)
  const [raw, setRaw] = useState<IklanData | IklanEmpty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------- tampilan
  const [filter, setFilter] = useState<IklanFilter>("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<IklanSortKey>("totalCost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  // 2. Data iklan untuk toko dan periode yang dipilih (dimuat ulang tiap tab dibuka).
  useEffect(() => {
    if (!storeId) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ store: storeId });
        if (period) {
          qs.set("start", period.start);
          qs.set("end", period.end);
        }
        const res = await fetch(`/api/analytics/iklan?${qs.toString()}`, {
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
        setRaw(json as IklanData | IklanEmpty);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("Gagal menghubungi server.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [storeId, period]);

  const data = raw && storeId && raw.store.id === storeId ? raw : null;
  const full = data && !data.empty ? data : null;

  const counts = useMemo(
    () => (full ? filterCounts(full.products) : null),
    [full],
  );
  const vcounts = useMemo(
    () => (full ? verdictCounts(full.products) : null),
    [full],
  );
  const shown = useMemo(
    () =>
      full
        ? filterSortProducts(full.products, {
            filter,
            query,
            key: sortKey,
            dir: sortDir,
          })
        : [],
    [full, filter, query, sortKey, sortDir],
  );

  function changeStore(id: string) {
    setStoreId(id);
    setPeriod(null);
    setFilter("ALL");
    setQuery("");
    setError(null);
  }

  function changePeriod(value: string) {
    const [start, end] = value.split("|");
    setPeriod(start && end ? { start, end } : null);
    setFilter("ALL");
  }

  function sortBy(key: IklanSortKey) {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

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

  const Th = ({
    label,
    k,
    right = true,
  }: {
    label: string;
    k?: IklanSortKey;
    right?: boolean;
  }) => (
    <th
      className={`py-2 px-3 font-medium text-xs text-neutral-500 whitespace-nowrap ${right ? "text-right" : "text-left"}`}
    >
      {k ? (
        <button
          onClick={() => sortBy(k)}
          className={`inline-flex items-center gap-1 hover:text-neutral-300 transition-colors ${sortKey === k ? "text-neutral-200" : ""}`}
        >
          {label}
          {sortKey === k &&
            (sortDir === "desc" ? (
              <ArrowDown size={11} />
            ) : (
              <ArrowUp size={11} />
            ))}
        </button>
      ) : (
        label
      )}
    </th>
  );

  const chipCls = (active: boolean) =>
    `text-xs px-2.5 py-1 rounded-full border transition-colors ${
      active
        ? "border-accent-500/50 text-accent-400 bg-accent-500/10"
        : "border-line text-neutral-400 hover:text-neutral-200"
    }`;

  const channelRow = (
    c: ChannelStat | (Omit<ChannelStat, "channel"> & { channel: "total" }),
  ) => (
    <tr key={c.channel} className="border-b border-white/5 last:border-0">
      <td className="py-2 px-3 text-neutral-100 whitespace-nowrap">
        {CHANNEL_LABEL[c.channel]}
      </td>
      <td className="py-2 px-3 text-right">{c.cost > 0 ? rp(c.cost) : "–"}</td>
      <td className="py-2 px-3 text-right text-neutral-400">
        {c.cost > 0 ? rp(c.gmv) : "–"}
      </td>
      <td className="py-2 px-3 text-right text-neutral-400">
        {c.cost > 0 ? nf(c.unitsSold) : "–"}
      </td>
      <td className="py-2 px-3 text-right font-medium text-neutral-100">
        {pct(c.acosPct)}
      </td>
      <td className="py-2 px-3 text-right text-neutral-400">{x2(c.roas)}</td>
      <td className="py-2 px-3 text-right text-neutral-400">
        {rpOrDash(c.costPerUnit == null ? null : c.costPerUnit)}
      </td>
      <td className="py-2 px-3 text-right text-neutral-400">
        {rpOrDash(c.costPerClick == null ? null : c.costPerClick)}
      </td>
      <td className="py-2 px-3 text-right text-neutral-400">{pct(c.ctrPct)}</td>
      <td className="py-2 px-3 text-right text-neutral-400">
        {pct(c.clickToUnitPct)}
      </td>
    </tr>
  );

  return (
    <div>
      {admin && admin !== currentUser && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-sm text-amber-200">
          Sesi login di server atas nama {admin}, sedangkan halaman ini
          menampilkan {currentUser}. Keluar lalu masuk lagi supaya sama.
        </div>
      )}

      {/* Pilih toko dan periode */}
      <div className="bg-panel border border-line rounded-xl p-4 mb-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[220px]">
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Toko
            </label>
            <select
              value={storeId}
              onChange={(e) => changeStore(e.target.value)}
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
          {full && (
            <div className="min-w-[240px]">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                Periode iklan
              </label>
              <select
                value={`${full.period.start}|${full.period.end}`}
                onChange={(e) => changePeriod(e.target.value)}
                className={`w-full ${inputCls}`}
              >
                {full.periods.map((p) => (
                  <option
                    key={`${p.start}|${p.end}`}
                    value={`${p.start}|${p.end}`}
                  >
                    {periodLabel({ start: p.start, end: p.end })}
                  </option>
                ))}
              </select>
            </div>
          )}
          {loading && (
            <Loader2
              size={16}
              className="animate-spin text-neutral-500 mb-2.5"
            />
          )}
        </div>
        {full && (
          <p className="text-[11px] text-neutral-500 mt-3">
            Biaya iklan adalah biaya nyata. Omzet dan pcs iklan adalah klaim
            versi Shopee (penjualan yang dikaitkan ke iklan, bisa termasuk
            pesanan yang kemudian batal), jadi ACOS di sini batas atas, bukan
            bukti bahwa iklan menambah penjualan.
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
          Belum ada file iklan untuk toko ini. Upload dulu file iklan (dan
          rincian iklan produk otomatis) di tab Upload.
        </div>
      ) : (
        full &&
        counts &&
        vcounts && (
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
                label="Biaya iklan"
                value={rp(full.total.cost)}
                sub={`Otomatis ${pct(
                  full.total.cost > 0
                    ? (100 * full.channels[1].cost) / full.total.cost
                    : null,
                )} · Individual ${pct(
                  full.total.cost > 0
                    ? (100 * full.channels[0].cost) / full.total.cost
                    : null,
                )}`}
              />
              <Stat
                label="ACOS gabungan"
                value={pct(full.total.acosPct)}
                sub={`ROAS ${x2(full.total.roas)} · omzet klaim ${rp(full.total.gmv)}`}
              />
              <Stat
                label="Biaya tanpa penjualan"
                value={rp(full.leak.cost)}
                sub={`${nf(full.leak.products)} produk · ${pct(full.leak.sharePct)} dari total biaya`}
                tone={
                  full.leak.sharePct != null && full.leak.sharePct >= 5
                    ? "warn"
                    : "default"
                }
              />
              <Stat
                label="Klaim iklan vs pcs terjual"
                value={
                  full.claim.pct == null
                    ? "–"
                    : `${Math.round(full.claim.pct)}%`
                }
                sub={`${nf(full.claim.claimedUnits)} pcs diklaim iklan · ${nf(full.claim.realUnits)} pcs valid (±${nf(full.claim.unitsInclCancelled)} termasuk yang batal)`}
              />
            </div>

            {/* Dua jalur */}
            <Card
              title="Otomatis vs individual"
              subtitle={`${periodLabel(full.period)} · semua angka per jalur dari file iklan`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line">
                      <Th label="Jalur" right={false} />
                      <Th label="Biaya" />
                      <Th label="Omzet klaim" />
                      <Th label="Pcs klaim" />
                      <Th label="ACOS" />
                      <Th label="ROAS" />
                      <Th label="Biaya/pcs" />
                      <Th label="Biaya/klik" />
                      <Th label="Klik/dilihat" />
                      <Th label="Pcs/klik" />
                    </tr>
                  </thead>
                  <tbody>
                    {full.channels.map((c) => channelRow(c))}
                    {channelRow({ channel: "total", ...full.total })}
                  </tbody>
                </table>
              </div>
              {full.reading.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {full.reading.map((t, i) => (
                    <li key={i} className="text-xs text-neutral-300">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Per produk */}
            <Card
              title="Per produk: dua jalur berdampingan"
              subtitle="Pcs nyata dan bersih per pcs dari pesanan dan penghasilan (sama dengan tab Panel)."
            >
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <button
                  onClick={() => setFilter("ALL")}
                  className={chipCls(filter === "ALL")}
                >
                  Semua ({full.products.length})
                </button>
                {counts.OVERLAP > 0 && (
                  <button
                    onClick={() =>
                      setFilter(filter === "OVERLAP" ? "ALL" : "OVERLAP")
                    }
                    className={chipCls(filter === "OVERLAP")}
                  >
                    Dua jalur sekaligus ({counts.OVERLAP})
                  </button>
                )}
                {VERDICT_ORDER.filter((v) => vcounts[v] > 0).map((v) => (
                  <button
                    key={v}
                    onClick={() => setFilter(filter === v ? "ALL" : v)}
                    className={chipCls(filter === v)}
                  >
                    {VERDICT_LABEL[v]} ({vcounts[v]})
                  </button>
                ))}
                {FLAG_ORDER.filter((f) => counts[f] > 0).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(filter === f ? "ALL" : f)}
                    className={chipCls(filter === f)}
                  >
                    {FLAG_LABEL[f]} ({counts[f]})
                  </button>
                ))}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari nama atau kode produk"
                  className={`ml-auto w-56 ${inputCls} py-1.5 text-xs`}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line">
                      <Th label="Produk" right={false} />
                      <Th label="Biaya individual" k="indCost" />
                      <Th label="Biaya otomatis" k="autoCost" />
                      <Th label="Porsi otomatis" k="autoSharePct" />
                      <Th label="Pcs klaim (indiv. / otom.)" k="claimedUnits" />
                      <Th label="ACOS (indiv. / otom.)" />
                      <Th label="Pcs nyata" k="realUnits" />
                      <Th
                        label="Iklan / bersih sebelum iklan"
                        k="adShareOfIncomePct"
                      />
                      <Th label="Bersih/pcs setelah iklan" k="netAfterAds" />
                      <Th label="Vonis" right={false} />
                      <Th label="Sorotan" right={false} />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => {
                      const v = adVerdict(p);
                      return (
                        <tr
                          key={p.productId}
                          className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                        >
                          <td className="py-2 px-3 max-w-[300px]">
                            <p className="text-neutral-100 truncate">
                              {p.productName ?? "(nama belum diketahui)"}
                            </p>
                            <p className="text-[11px] text-neutral-600">
                              {p.productId}
                            </p>
                          </td>
                          <td className="py-2 px-3 text-right">
                            {p.ind.cost > 0 ? rp(p.ind.cost) : "–"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {p.auto.cost > 0 ? rp(p.auto.cost) : "–"}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {p.ind.cost > 0 && p.auto.cost > 0
                              ? pct(p.autoSharePct)
                              : p.auto.cost > 0
                                ? "100%"
                                : "–"}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400 whitespace-nowrap">
                            {p.ind.cost > 0 ? nf(p.ind.units) : "–"} /{" "}
                            {p.auto.cost > 0 ? nf(p.auto.units) : "–"}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400 whitespace-nowrap">
                            {pct(p.ind.cost > 0 ? p.ind.acosPct : null)} /{" "}
                            {pct(p.auto.cost > 0 ? p.auto.acosPct : null)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {p.realUnits == null ? "–" : nf(p.realUnits)}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-400">
                            {pct(p.adShareOfIncomePct)}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-neutral-100">
                            {p.netAfterAds == null
                              ? "–"
                              : rpSigned(p.netAfterAds)}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              title={v.reason}
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap cursor-help ${VERDICT_TONE[v.verdict]}`}
                            >
                              {VERDICT_LABEL[v.verdict]}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex gap-1 flex-wrap">
                              {p.flags.map((f) => (
                                <span
                                  key={f}
                                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${FLAG_TONE[f]}`}
                                >
                                  {FLAG_LABEL[f]}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && (
                      <tr>
                        <td
                          colSpan={11}
                          className="py-6 text-center text-xs text-neutral-500"
                        >
                          Tidak ada produk yang cocok dengan filter ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-neutral-500 mt-4 leading-relaxed">
                Vonis dan sorotan adalah tanda untuk dilihat lebih dekat, bukan
                perintah. Arahkan kursor ke badge vonis untuk melihat alasannya.{" "}
                <b>Iklan mahal per pcs</b>: biaya iklan per pcs memakan{" "}
                {full.thresholds.highAdSharePct}% atau lebih dari bersih per pcs
                sebelum iklan (produk dengan minimal{" "}
                {full.thresholds.highAdShareMinOrders} pesanan valid).{" "}
                <b>ACOS tinggi</b>: ACOS satu jalur{" "}
                {full.thresholds.highAcosPct}% atau lebih, dengan biaya minimal{" "}
                {rp(full.thresholds.highAcosMinCost)}. <b>Tanpa hasil</b>: ada
                biaya di jalur itu tetapi tidak ada pcs yang diklaim. &quot;Pcs
                nyata&quot; adalah pcs dari pesanan valid, sedangkan klaim iklan
                bisa lebih besar karena cara Shopee mengaitkan penjualan.
              </p>
              <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                <b>Vonis</b> menilai biaya iklan terhadap bersih per pcs, bukan
                untung rugi: modal barang belum dikurangi dan target kerja tidak
                dihitung (lihat tab Panel). <b>Data kurang</b>: biaya iklan di
                bawah {rp(VERDICT_RULES.minCost)} atau kurang dari{" "}
                {VERDICT_RULES.minOrders} pesanan valid.{" "}
                <b>Pertimbangkan hentikan</b>: iklan memakan{" "}
                {VERDICT_RULES.stopSharePct}% atau lebih dari bersih per pcs,
                atau bersih setelah iklan nol atau rugi. <b>Pantau</b>: iklan
                memakan {VERDICT_RULES.watchSharePct}% atau lebih, atau klaim
                iklan lebih dari {VERDICT_RULES.claimRatio}× perkiraan pcs
                termasuk pesanan yang batal. <b>Wajar</b>: di luar itu.
              </p>
            </Card>

            {/* Daftar iklan individual */}
            <Card
              title="Iklan individual"
              subtitle="Satu baris per iklan di file iklan periode ini."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line">
                      <Th label="Iklan" right={false} />
                      <Th label="Status" right={false} />
                      <Th label="Mode" right={false} />
                      <Th label="Biaya" />
                      <Th label="Omzet klaim" />
                      <Th label="Pcs klaim" />
                      <Th label="ACOS" />
                      <Th label="ROAS" />
                    </tr>
                  </thead>
                  <tbody>
                    {full.ads.map((a) => (
                      <tr
                        key={`${a.productCode}|${a.adName}`}
                        className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                      >
                        <td className="py-2 px-3 max-w-[320px]">
                          <p className="text-neutral-100 truncate">
                            {a.adName}
                          </p>
                          <p className="text-[11px] text-neutral-600">
                            {a.productCode}
                          </p>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${AD_STATUS_TONE(a.status)}`}
                          >
                            {a.status ?? "–"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-neutral-400 whitespace-nowrap">
                          {a.biddingMode ?? "–"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {a.cost > 0 ? rp(a.cost) : "–"}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {a.cost > 0 ? rp(a.gmv) : "–"}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {a.cost > 0 ? nf(a.unitsSold) : "–"}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-neutral-100">
                          {pct(a.acosPct)}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {x2(a.roas)}
                        </td>
                      </tr>
                    ))}
                    {full.ads.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-6 text-center text-xs text-neutral-500"
                        >
                          Tidak ada iklan individual di periode ini.
                        </td>
                      </tr>
                    )}
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
