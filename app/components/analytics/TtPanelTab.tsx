"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { STATUS_LABEL, STATUS_ORDER, type Status } from "@/lib/analytics/panel";
import type { TtPanelData, TtPanelEmpty } from "@/lib/analytics/ttPanel";
import {
  PRESET_LABEL,
  presetRange,
  type Preset,
} from "@/lib/analytics/ttPesananView";
import {
  STATUS_TONE,
  applyTarget,
  countByStatus,
  daysInPeriod,
  filterAndSort,
  noOrderStats,
  parseTargetInput,
  thresholdTable,
  type SortDir,
  type SortKey,
} from "@/lib/analytics/panelView";
import { fmtDate, periodLabel, rp, rpSigned } from "@/lib/analytics/uploadView";
import { Card, Stat } from "./ui";

type StoreOpt = { id: string; code: string; name: string };
type Range = { from: string; to: string };

const PRESETS: Preset[] = ["7", "30", "month", "lastmonth", "all"];
const todayWib = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
const chipCls =
  "text-xs px-2.5 py-1 rounded-full border border-line text-neutral-400 hover:text-neutral-200 transition-colors";

const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");
const rpOrDash = (n: number | null): string => (n == null ? "–" : rp(n));

const inputCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all";

export default function TtPanelTab({ currentUser }: { currentUser: string }) {
  const router = useRouter();

  // ---------------------------------------------------------------- toko dan data
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [booted, setBooted] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [range, setRange] = useState<Range | null>(null); // null = bulan terakhir (ditentukan server)
  const [raw, setRaw] = useState<TtPanelData | TtPanelEmpty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ---------------------------------------------------------------- tampilan
  const [simText, setSimText] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("validUnits");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showEmpty, setShowEmpty] = useState(false); // tampilkan produk tanpa pesanan

  // ---------------------------------------------------------------- simpan target
  const [saveOpen, setSaveOpen] = useState(false);
  const [effFrom, setEffFrom] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // 1. Daftar toko milik admin yang login (sekali).
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

  // 2. Data panel untuk toko dan rentang yang dipilih.
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
        const res = await fetch(`/api/analytics/tt-panel?${qs.toString()}`, {
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat data panel.");
          setRaw(null);
          return;
        }
        setRaw(json as TtPanelData | TtPanelEmpty);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("Gagal menghubungi server.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [storeId, range, reloadKey]);

  const data = raw && storeId && raw.store.id === storeId ? raw : null;
  const full = data && !data.empty ? data : null;

  // Tanggal mulai berlaku bawaan = awal periode yang sedang dilihat.
  const periodStart = full ? full.period.start : "";
  useEffect(() => {
    if (periodStart) setEffFrom(periodStart);
  }, [periodStart]);

  // ---------------------------------------------------------------- turunan
  const sim = parseTargetInput(simText);
  const simActive = sim != null;
  const rows = useMemo(
    () => (full ? applyTarget(full.rows, sim) : []),
    [full, sim],
  );
  const counts = useMemo(() => countByStatus(rows), [rows]);
  const shown = useMemo(
    () =>
      filterAndSort(rows, {
        status: statusFilter,
        query,
        key: sortKey,
        dir: sortDir,
        hideNoOrders: !showEmpty,
      }),
    [rows, statusFilter, query, sortKey, sortDir, showEmpty],
  );
  const empties = useMemo(() => noOrderStats(rows), [rows]);
  const days = full ? daysInPeriod(full.period.start, full.period.end) : 1;
  const thresholds = useMemo(
    () => (full ? thresholdTable(full.rows, days) : []),
    [full, days],
  );

  function changeStore(id: string) {
    setStoreId(id);
    setRange(null);
    setSimText("");
    setStatusFilter("ALL");
    setQuery("");
    setSaveOpen(false);
    setSaveMsg(null);
    setError(null);
  }

  function changeRange(next: Range) {
    setRange(next);
    setSimText("");
    setSaveOpen(false);
    setSaveMsg(null);
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function saveTarget() {
    if (!full || sim == null || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/analytics/tt-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store: storeId,
          kind: "kerja",
          target: sim,
          effectiveFrom: effFrom,
          note,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSaveMsg({
          ok: false,
          text: json.error ?? "Gagal menyimpan target.",
        });
        return;
      }
      setSaveMsg({
        ok: true,
        text: json.unchanged
          ? "Target itu sudah tersimpan dengan nilai yang sama, tidak ada yang berubah."
          : `Target kerja ${rp(json.target)} per pcs berlaku mulai ${fmtDate(json.effectiveFrom)}. Periode sebelumnya tetap dinilai dengan target lamanya.`,
      });
      setSimText("");
      setSaveOpen(false);
      setNote("");
      setReloadKey((k) => k + 1);
    } catch {
      setSaveMsg({ ok: false, text: "Gagal menghubungi server." });
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------- keadaan khusus
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
    k?: SortKey;
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

  const activeTarget = simActive ? sim : full ? full.targets.kerja : null;

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
              Toko TikTok
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
          <div>
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Pesanan dibuat dari
            </label>
            <input
              type="date"
              value={full ? full.period.start : ""}
              disabled={!full}
              onChange={(e) =>
                full &&
                changeRange({ from: e.target.value, to: full.period.end })
              }
              className={`${inputCls} [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70`}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Sampai
            </label>
            <input
              type="date"
              value={full ? full.period.end : ""}
              disabled={!full}
              onChange={(e) =>
                full &&
                changeRange({ from: full.period.start, to: e.target.value })
              }
              className={`${inputCls} [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70`}
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
                  if (rg) changeRange(rg);
                }}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        {full && (
          <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
            Rentang dihitung dari <b>tanggal pesanan dibuat</b>. Bersih per pcs
            = dana yang dilepas TikTok per pcs, dikurangi biaya iklan per pcs,
            belum dikurangi modal barang.
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
          Pilih toko untuk melihat panelnya.
        </p>
      ) : !data ? (
        loading ? (
          <p className="text-sm text-neutral-500">Memuat…</p>
        ) : null
      ) : data.empty ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Belum ada data pesanan untuk toko ini. Upload dulu file pesanan,
          income, dan Campaign overview TikTok di tab Upload.
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

            <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 text-xs text-sky-200 leading-relaxed">
              <b>Cara membaca iklan TikTok.</b> TikTok hanya memberi biaya iklan
              per hari untuk seluruh toko, bukan per produk. Karena itu total
              biaya iklan di rentang ini dibagi rata per pcs ke semua produk
              {full.summary.adCostPerUnit != null
                ? ` (sekitar ${rp(full.summary.adCostPerUnit)} per pcs)`
                : ""}
              . Biaya iklan per produk di tabel adalah perkiraan, bukan biaya
              sebenarnya produk itu. Angka produk yang pcs-nya paling banyak
              paling bisa dipercaya, karena hampir sama dengan rata-rata toko.
            </div>

            {/* Angka utama */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat
                label="Target kerja per pcs"
                value={
                  simActive
                    ? `${rp(sim)} (simulasi)`
                    : full.targets.kerja != null
                      ? rp(full.targets.kerja)
                      : "Belum diisi"
                }
                sub={
                  simActive
                    ? "Belum disimpan. Hanya untuk mencoba."
                    : full.targets.kerjaFrom
                      ? `berlaku sejak ${fmtDate(full.targets.kerjaFrom)}`
                      : undefined
                }
                tone={simActive ? "warn" : "default"}
              />
              <Stat
                label="Produk masuk target"
                value={`${nf(counts.MASUK_TARGET)} dari ${nf(
                  counts.MASUK_TARGET + counts.DI_BAWAH_TARGET + counts.RUGI,
                )}`}
                sub={`${nf(counts.SAMPEL_KECIL + counts.DATA_BELUM_LENGKAP)} produk belum cukup datanya`}
                tone={counts.MASUK_TARGET > 0 ? "good" : "warn"}
              />
              <Stat
                label="Biaya iklan"
                value={rp(full.summary.adCost)}
                sub={`${nf(full.summary.validUnits)} pcs valid · ${nf(full.summary.products)} produk`}
              />
              <Stat
                label="Dana sudah cair"
                value={
                  full.summary.coveragePct == null
                    ? "–"
                    : `${full.summary.coveragePct}%`
                }
                sub="dari pcs valid periode ini"
                tone={
                  full.summary.coveragePct != null &&
                  full.summary.coveragePct < full.rules.minCoveragePct
                    ? "warn"
                    : "default"
                }
              />
            </div>

            {/* Simulasi dan target resmi */}
            <Card
              title="Coba target"
              subtitle="Ketik target untuk melihat produk mana yang masuk. Tidak tersimpan sampai kamu menjadikannya target resmi."
            >
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                    Target bersih per pcs (Rp)
                  </label>
                  <input
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    placeholder={
                      full.targets.kerja != null
                        ? `kosong = target resmi ${rp(full.targets.kerja)}`
                        : "mis. 60000 atau 60rb"
                    }
                    inputMode="numeric"
                    className={`w-64 ${inputCls}`}
                  />
                </div>
                {simText.trim() !== "" && !simActive && (
                  <p className="text-xs text-amber-300 pb-2.5">
                    Angka tidak terbaca. Contoh: 60000, 60.000, atau 60rb.
                  </p>
                )}
                {simActive && (
                  <>
                    <button
                      onClick={() => setSimText("")}
                      className="text-xs px-3 py-2 rounded-lg border border-line text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
                    >
                      Kembali ke target resmi
                    </button>
                    <button
                      onClick={() => {
                        setSaveOpen((v) => !v);
                        setSaveMsg(null);
                      }}
                      className="text-xs px-3 py-2 rounded-lg bg-accent-500 hover:bg-accent-400 text-white font-medium transition-colors"
                    >
                      Jadikan target resmi…
                    </button>
                  </>
                )}
              </div>

              {simActive && saveOpen && (
                <div className="mt-4 border border-line rounded-lg p-4 bg-black/20">
                  <p className="text-sm text-neutral-200 mb-3">
                    Simpan target kerja <b>{rp(sim)}</b> per pcs untuk{" "}
                    {full.store.code}.
                  </p>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div>
                      <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                        Berlaku mulai
                      </label>
                      <input
                        type="date"
                        value={effFrom}
                        onChange={(e) => setEffFrom(e.target.value)}
                        className={`${inputCls} [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70`}
                      />
                    </div>
                    <div className="grow min-w-[200px]">
                      <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                        Catatan (boleh kosong)
                      </label>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={200}
                        placeholder="mis. disepakati dengan bos"
                        className={`w-full ${inputCls}`}
                      />
                    </div>
                    <button
                      onClick={saveTarget}
                      disabled={saving || !effFrom}
                      className="px-4 py-2 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center gap-2"
                    >
                      {saving && <Loader2 size={14} className="animate-spin" />}
                      Ya, simpan
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-3">
                    {effFrom && effFrom > full.period.start
                      ? `Periode yang sedang dilihat (mulai ${fmtDate(full.period.start)}) tidak ikut berubah, hanya periode yang mulai ${fmtDate(effFrom)} atau sesudahnya.`
                      : `Periode lama sebelum ${effFrom ? fmtDate(effFrom) : "tanggal itu"} tetap dinilai dengan target lamanya.`}{" "}
                    Setiap perubahan tercatat di riwayat.
                  </p>
                </div>
              )}

              {saveMsg && (
                <p
                  className={`mt-4 text-xs flex items-start gap-1.5 ${saveMsg.ok ? "text-emerald-400" : "text-red-300"}`}
                >
                  {saveMsg.ok ? (
                    <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  )}
                  {saveMsg.text}
                </p>
              )}

              {full.targets.history.length > 0 && (
                <div className="mt-4 text-[11px] text-neutral-500">
                  <p className="font-medium text-neutral-400 mb-1">
                    Riwayat target kerja
                  </p>
                  <ul className="space-y-0.5">
                    {full.targets.history.map((h, i) => (
                      <li key={i}>
                        {fmtDate(h.effectiveFrom)}: {rp(h.target)} · oleh{" "}
                        {h.updatedBy}
                        {h.note ? ` · ${h.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Tabel per produk */}
            <Card
              title="Untung setelah iklan per produk"
              subtitle={`${periodLabel(full.period)} · target ${
                activeTarget != null ? rp(activeTarget) : "belum diisi"
              }${simActive ? " (simulasi)" : ""}`}
            >
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <button
                  onClick={() => setStatusFilter("ALL")}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    statusFilter === "ALL"
                      ? "border-accent-500/50 text-accent-400 bg-accent-500/10"
                      : "border-line text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  Semua ({rows.length})
                </button>
                {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setStatusFilter(statusFilter === s ? "ALL" : s)
                    }
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      statusFilter === s
                        ? "border-accent-500/50 text-accent-400 bg-accent-500/10"
                        : "border-line text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {STATUS_LABEL[s]} ({counts[s]})
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
                      <Th label="Pesanan" k="validOrders" />
                      <Th label="Pcs" k="validUnits" />
                      <Th label="Dana cair" k="coveragePct" />
                      <Th label="Bersih/pcs sebelum iklan" />
                      <Th label="Iklan/pcs (rata-rata toko)" />
                      <Th label="Bersih/pcs setelah iklan" k="netAfterAds" />
                      <Th label="Selisih ke target" k="gap" />
                      <Th label="Biaya iklan (dibagi rata)" k="adCost" />
                      <Th label="Perkiraan total" k="estTotal" />
                      <Th label="Status" right={false} />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr
                        key={r.productId}
                        className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                      >
                        <td className="py-2 px-3 max-w-[320px]">
                          <p className="text-neutral-100 truncate">
                            {r.productName ?? "(nama belum diketahui)"}
                          </p>
                          <p className="text-[11px] text-neutral-600">
                            {r.productId}
                          </p>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {nf(r.validOrders)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {nf(r.validUnits)}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {r.coveragePct == null ? "–" : `${r.coveragePct}%`}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {rpOrDash(r.avgIncome)}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {rpOrDash(r.adCostPerUnit)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-neutral-100">
                          {r.netAfterAds == null
                            ? "–"
                            : rpSigned(r.netAfterAds)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right ${
                            r.shownGap == null
                              ? "text-neutral-600"
                              : r.shownGap >= 0
                                ? "text-emerald-400"
                                : "text-amber-400"
                          }`}
                        >
                          {r.shownGap == null ? "–" : rpSigned(r.shownGap)}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {r.adCost > 0 ? rp(r.adCost) : "–"}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {r.estTotal == null ? "–" : rpSigned(r.estTotal)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_TONE[r.shownStatus]}`}
                          >
                            {STATUS_LABEL[r.shownStatus]}
                          </span>
                          {!simActive && r.bossStatus != null && (
                            <span className="ml-1.5 text-[10px] text-neutral-500">
                              bos: {STATUS_LABEL[r.bossStatus]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
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

              {empties.count > 0 &&
                statusFilter === "ALL" &&
                query.trim() === "" && (
                  <button
                    onClick={() => setShowEmpty((v) => !v)}
                    className="mt-3 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {showEmpty
                      ? `Sembunyikan ${empties.count} produk tanpa pesanan`
                      : `Tampilkan ${empties.count} produk tanpa pesanan (biaya iklan ${rp(empties.adCost)}, sudah termasuk di total)`}
                  </button>
                )}

              <p className="text-[11px] text-neutral-500 mt-4 leading-relaxed">
                Urutan penilaian: <b>Rugi</b> (ada biaya iklan tapi bersih ≤ 0),
                lalu <b>Sampel kecil</b> (kurang dari {full.rules.minOrders}{" "}
                pesanan valid), lalu <b>Data belum lengkap</b> (dana baru cair
                untuk kurang dari {full.rules.minCoveragePct}% pcs), baru
                dibandingkan dengan target. &quot;Perkiraan total&quot; = bersih
                per pcs × pcs valid − biaya iklan, jadi ikut berubah kalau dana
                yang belum cair sudah masuk.
              </p>
            </Card>

            {/* Tabel geser target */}
            <Card
              title="Kalau targetnya …"
              subtitle="Berapa produk yang masuk di tiap target. Hanya produk yang cukup datanya. Klik baris untuk mencobanya di atas."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line">
                      <Th label="Target per pcs" right={false} />
                      <Th label="Produk masuk" />
                      <Th label="Pcs per hari" />
                      <Th label="Perkiraan bersih per hari" />
                    </tr>
                  </thead>
                  <tbody>
                    {thresholds.map((t) => (
                      <tr
                        key={t.target}
                        onClick={() => setSimText(String(t.target))}
                        className={`border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/[0.03] ${
                          activeTarget === t.target ? "bg-accent-500/5" : ""
                        }`}
                      >
                        <td className="py-2 px-3 text-neutral-100">
                          {rp(t.target)}
                        </td>
                        <td className="py-2 px-3 text-right">{t.products}</td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {t.products > 0
                            ? t.unitsPerDay.toLocaleString("id-ID", {
                                maximumFractionDigits: 1,
                              })
                            : "–"}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-400">
                          {t.products > 0 ? rp(t.netPerDay) : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-neutral-500 mt-3">
                Dihitung dari {days} hari di periode ini. Angka per hari hanya
                dari produk yang masuk di target itu.
              </p>
            </Card>
          </div>
        )
      )}
    </div>
  );
}
