"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Package, PackageCheck, Search, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { shiftDateStr, todayStr, wibStartISO } from "@/lib/dates";
import { useConfirm, type ConfirmOptions } from "./ConfirmDialog";

export type StoreOption = {
  id: string;
  name: string;
  code: string;
  managed_by: string;
};

type SaleStage =
  | "belum_siap"
  | "siap_kirim"
  | "batal_menunggu"
  | "retur"
  | "dibatalkan"
  | "lama";

function saleStage(s: any): SaleStage {
  if (s.status === "batal") return "retur"; // paket sudah kembali & discan
  if (s.packed_by === "dibatalkan") return "dibatalkan"; // batal sebelum berangkat
  if (s.cancelled_at) return "batal_menunggu"; // batal di agen, paket belum discan balik
  if (s.packed_by === "sebelum fitur siap kirim") return "lama";
  return s.packed_at ? "siap_kirim" : "belum_siap";
}

const STAGE_META: Record<
  SaleStage,
  { label: string; badge: string; card: string }
> = {
  belum_siap: {
    label: "Dicetak",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    card: "border-amber-500/30 bg-amber-500/5",
  },
  siap_kirim: {
    label: "Dikirim",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    card: "border-emerald-500/20 bg-emerald-500/5",
  },
  lama: {
    label: "Dikirim",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    card: "border-emerald-500/20 bg-emerald-500/5",
  },
  batal_menunggu: {
    label: "Batal · menunggu balik",
    badge: "bg-violet-500/10 text-violet-300 border-violet-500/20",
    card: "border-violet-500/30 bg-violet-500/5",
  },
  retur: {
    label: "Retur",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
    card: "border-red-500/30 bg-red-500/5",
  },
  dibatalkan: {
    label: "Dibatalkan",
    badge: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
    card: "border-line bg-panel",
  },
};

function StageBadge({
  stage,
  soldAt,
  packedAt,
  packedBy,
  cancelledAt,
}: {
  stage: SaleStage;
  soldAt: string;
  packedAt: string | null;
  packedBy?: string | null;
  cancelledAt?: string | null;
}) {
  const meta = STAGE_META[stage];
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <div className="flex items-center gap-2 mb-2.5 text-[11px]">
      <span className={`px-2 py-0.5 rounded-full border ${meta.badge}`}>
        {meta.label}
      </span>
      {stage === "siap_kirim" && packedAt && (
        <span className="text-neutral-500">
          Dicetak {fmt(soldAt)} · Dikirim {fmt(packedAt)}
          {packedBy && /manual/i.test(packedBy) && " (manual)"}
        </span>
      )}
      {stage === "batal_menunggu" && cancelledAt && (
        <span className="text-neutral-500">
          Dibatalkan {fmt(cancelledAt)} · paket belum discan balik
        </span>
      )}
    </div>
  );
}

// Aturan kolom di tabel sales (sama untuk Shopee & TikTok):
//   awb_number  = nomor resi (yang ada di barcode label, dipakai scanner)
//   resi_number = nomor pesanan (No. Pesanan / Order ID)
// Pengecualian: pesanan Instant tidak punya resi, jadi awb_number kosong.

function CopyChip({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: (v: string) => void;
}) {
  return (
    <button
      onClick={() => onCopy(value)}
      className="text-right group"
      title={`Klik untuk salin ${label.toLowerCase()}`}
    >
      <p className="text-[10px] text-neutral-500 group-hover:text-accent-400 transition-colors">
        {copied ? "Tersalin!" : label}
      </p>
      <p className="text-xs font-mono text-neutral-300 group-hover:text-accent-400 transition-colors">
        {value}
      </p>
    </button>
  );
}

const SALES_PAGE_SIZE = 200;
const SALES_MAX_ROWS = 1000;

type StageFilter =
  | ""
  | "belum_siap"
  | "dikirim"
  | "batal"
  | "batal_menunggu"
  | "retur";

// Pilihan dropdown Status. Admin melihat tahap batal secara rinci; host
// cukup tiga status (semua jenis batal digabung jadi satu "Batal").
const ADMIN_STATUS_OPTIONS: { value: StageFilter; label: string }[] = [
  { value: "", label: "Semua status" },
  { value: "belum_siap", label: "Dicetak" },
  { value: "batal_menunggu", label: "Batal · menunggu balik" },
  { value: "retur", label: "Retur" },
];
const HOST_STATUS_OPTIONS: { value: StageFilter; label: string }[] = [
  { value: "", label: "Semua status" },
  { value: "dikirim", label: "Dikirim" },
  { value: "belum_siap", label: "Dicetak" },
  { value: "batal", label: "Batal" },
];

export default function CatatanPenjualanSection({
  currentUser,
  readOnly = false,
}: {
  currentUser: string;
  /** Mode host: hanya melihat status, tanpa tombol Tandai Dikirim / Batal. */
  readOnly?: boolean;
}) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [stageFilter, setStageFilter] = useState<StageFilter>("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(shiftDateStr(todayStr(), -7));
  const [dateTo, setDateTo] = useState(todayStr());
  const [storeFilter, setStoreFilter] = useState("");
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [limit, setLimit] = useState(SALES_PAGE_SIZE);
  const [totalRows, setTotalRows] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const askConfirm = useConfirm();

  // Karakter ini merusak sintaks filter .or() di Supabase.
  const searchTerm = search.trim().replace(/[,()%*]/g, "");
  const isSearching = searchTerm.length > 0;

  async function loadStores() {
    const { data: storeData } = await supabase
      .from("stores")
      .select("id, name, code, managed_by")
      .order("code");
    if (storeData) setStores(storeData);
  }

  async function loadSalesHistory() {
    if (!isSearching && (!dateFrom || !dateTo)) return;
    const myRequest = ++requestIdRef.current;
    setLoading(true);
    setErrorMsg(null);

    // Filter admin & toko dilakukan di database (stores!inner), sebelum
    // limit -- jadi limit hanya menghitung baris milik toko yang dilihat,
    // bukan berebut jatah dengan toko admin lain.
    let query = supabase
      .from("sales")
      .select(
        "id, quantity, sold_at, sold_by, resi_number, awb_number, status, packed_at, packed_by, cancelled_at, products(full_name, photo_url), stores!inner(code, name, managed_by)",
        { count: "exact" },
      )
      .eq("stores.managed_by", currentUser)
      .order("sold_at", { ascending: false })
      .limit(limit);

    // Query hanya memakai satu parameter .or(): syarat pencarian dan syarat
    // status dikumpulkan dulu di sini, lalu digabung di bawah.
    let searchOr: string | null = null;
    let stageOr: string | null = null;

    if (isSearching) {
      // Cari nomor: rentang tanggal diabaikan, karena retur bisa datang
      // berminggu-minggu setelah resi dicetak.
      searchOr = `resi_number.ilike.%${searchTerm}%,awb_number.ilike.%${searchTerm}%`;
    } else {
      // Batas hari dihitung dalam WIB (UTC+7), bukan UTC.
      query = query
        .gte("sold_at", wibStartISO(dateFrom))
        .lt("sold_at", wibStartISO(shiftDateStr(dateTo, 1)));
    }

    if (storeFilter) query = query.eq("stores.code", storeFilter);
    if (stageFilter === "belum_siap") {
      // status selalu terisi (ada default di database), jadi neq aman dipakai
      // dan tidak perlu .or() kedua yang bisa bentrok dengan filter pencarian.
      query = query.is("packed_at", null).neq("status", "batal");
    } else if (stageFilter === "dikirim") {
      // Sudah berangkat dan tidak dibatalkan (tahap "siap_kirim" + "lama").
      // packed_by bisa NULL dan neq() biasa ikut membuang baris NULL, jadi
      // pengecualian "dibatalkan" dicek lewat .or().
      query = query
        .not("packed_at", "is", null)
        .is("cancelled_at", null)
        .neq("status", "batal");
      stageOr = "packed_by.is.null,packed_by.neq.dibatalkan";
    } else if (stageFilter === "batal") {
      // Semua jenis batal: sebelum berangkat, di agen (menunggu balik), retur.
      stageOr =
        "status.eq.batal,packed_by.eq.dibatalkan,cancelled_at.not.is.null";
    } else if (stageFilter === "batal_menunggu") {
      // Dibatalkan tapi paketnya belum discan balik di scanner return.
      query = query.not("cancelled_at", "is", null).neq("status", "batal");
    } else if (stageFilter === "retur") {
      query = query.eq("status", "batal");
    }

    if (searchOr && stageOr) {
      query = query.or(`and(or(${searchOr}),or(${stageOr}))`);
    } else if (searchOr || stageOr) {
      query = query.or((searchOr ?? stageOr) as string);
    }

    const { data, count, error } = await query;

    // Abaikan hasil kalau sudah ada permintaan yang lebih baru
    // (misalnya ganti tanggal cepat-cepat).
    if (myRequest !== requestIdRef.current) return;

    if (error) {
      setErrorMsg(error.message);
      setSalesHistory([]);
      setTotalRows(0);
      setLoading(false);
      return;
    }

    setSalesHistory(data ?? []);
    setTotalRows(count ?? data?.length ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    loadStores();
  }, []);

  // Jeda 300 ms hanya saat mengetik di kolom cari, supaya tidak query tiap huruf.
  useEffect(() => {
    const t = setTimeout(loadSalesHistory, isSearching ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dateFrom,
    dateTo,
    storeFilter,
    stageFilter,
    limit,
    currentUser,
    searchTerm,
  ]);

  function copyNumber(value: string) {
    navigator.clipboard.writeText(value);
    setCopiedNumber(value);
    setTimeout(() => setCopiedNumber(null), 1500);
  }

  // --- Tombol tandai manual ------------------------------------------------

  // Konfirmasi dulu, lalu update semua baris (produk) milik pesanan itu.
  // `patch` berupa fungsi supaya timestamp diambil saat user menekan tombol
  // konfirmasi, bukan saat dialog dibuka. `guard` menambah syarat supaya
  // klik ganda / data yang sudah berubah di tab lain tidak menimpa apa pun.
  async function runAction(
    g: any,
    dialog: ConfirmOptions,
    patch: () => Record<string, any>,
    guard: (q: any) => any,
  ) {
    if (!(await askConfirm(dialog))) return;
    setBusyKey(g.key);
    const { error } = await guard(
      supabase.from("sales").update(patch()).in("id", g.ids),
    );
    setBusyKey(null);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    loadSalesHistory();
  }

  const labelOf = (g: any) => g.trackingNo ?? g.orderNo ?? "";

  // Kartu kuning -> dikirim tanpa scan (urgen). Dicatat siapa yang menandai.
  function markShipped(g: any) {
    runAction(
      g,
      {
        title: `Tandai ${labelOf(g)} sebagai dikirim?`,
        message:
          "Pastikan paket sudah dikirimkan ke agen jasa kirim (atau diambil kurir untuk Instant).",
        confirmLabel: "Ya, tandai dikirim",
        tone: "success",
        icon: PackageCheck,
      },
      () => ({
        packed_at: new Date().toISOString(),
        packed_by: `manual: ${currentUser}`,
      }),
      (q) => q.is("packed_at", null),
    );
  }

  // Tombol "Tandai Batal" -- perilakunya mengikuti warna kartu.
  function markCancelled(g: any) {
    if (g.stage === "belum_siap") {
      // Kuning: belum diantar ke agen jasa kirim, jadi bukan retur.
      runAction(
        g,
        {
          title: `Tandai ${labelOf(g)} sebagai batal?`,
          message:
            "Pesanan dibatalkan sebelum paket diantar ke agen jasa kirim.",
          confirmLabel: "Ya, tandai batal",
          tone: "danger",
        },
        () => ({
          packed_at: new Date().toISOString(),
          packed_by: "dibatalkan",
        }),
        (q) => q.is("packed_at", null),
      );
    } else {
      // Hijau: sudah diantar, dibatalkan di agen. Baru jadi Retur setelah
      // paketnya discan balik di scanner return.
      runAction(
        g,
        {
          title: `Tandai ${labelOf(g)} sebagai batal?`,
          message:
            'Pesanan dibatalkan setelah paket diantar ke agen jasa kirim. Statusnya "menunggu balik" sampai paketnya discan di scanner return.',
          confirmLabel: "Ya, tandai batal",
          tone: "danger",
        },
        () => ({ cancelled_at: new Date().toISOString() }),
        (q) => q.is("cancelled_at", null).neq("status", "batal"),
      );
    }
  }

  const myStores = stores.filter((s: any) => s.managed_by === currentUser);
  const statusOptions = readOnly ? HOST_STATUS_OPTIONS : ADMIN_STATUS_OPTIONS;

  const filteredHistory = salesHistory.filter(
    (s) => !storeFilter || s.stores?.code === storeFilter,
  );

  const totalQty = filteredHistory.reduce((sum, s) => sum + s.quantity, 0);

  // Data di database bisa lebih banyak dari yang sudah dimuat.
  const isIncomplete = totalRows > salesHistory.length;
  const canLoadMore = isIncomplete && limit < SALES_MAX_ROWS;

  // Satu pesanan bisa punya beberapa produk berbeda -- digabung jadi satu
  // kartu berdasarkan resi_number (nomor pesanan), sama pola-nya kayak
  // Catatan Retur.
  const grouped = Object.values(
    filteredHistory.reduce((acc: Record<string, any>, s: any, idx: number) => {
      const key = s.resi_number || `no-resi-${idx}`;
      if (!acc[key]) {
        acc[key] = {
          key,
          // Nomor resi (barcode). Kosong untuk pesanan Instant.
          trackingNo: s.awb_number ?? null,
          // Nomor pesanan, disembunyikan kalau sama persis dengan nomor resi
          // (data Shopee lama menyimpan SPXID di kedua kolom).
          orderNo:
            s.resi_number && s.resi_number !== s.awb_number
              ? s.resi_number
              : null,
          store: s.stores?.code,
          sold_at: s.sold_at,
          stage: saleStage(s),
          packed_at: s.packed_at,
          packed_by: s.packed_by,
          cancelled_at: s.cancelled_at,
          ids: [] as any[],
          items: [] as any[],
        };
      }
      acc[key].ids.push(s.id);
      acc[key].items.push({
        product: s.products?.full_name ?? "(produk tidak ditemukan)",
        photo: s.products?.photo_url,
        qty: s.quantity,
      });
      return acc;
    }, {}),
  );

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Catatan Penjualan
      </h2>

      {/* Search nomor resi / nomor pesanan -- elemen paling menonjol, sesuai use case utama */}
      <div className="relative mb-4">
        <Search
          size={16}
          strokeWidth={1.75}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(SALES_PAGE_SIZE);
          }}
          placeholder="Cari nomor resi atau nomor pesanan..."
          className="w-full bg-panel border border-line rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
        />
        {isSearching && (
          <p className="text-[11px] text-neutral-500 mt-1.5 px-1">
            Mencari di semua tanggal -- rentang tanggal di bawah diabaikan
            selama kolom cari terisi.
          </p>
        )}
      </div>

      {/* Filter tanggal, toko & status */}
      <div
        className={`bg-panel border border-line rounded-xl p-4 mb-4 flex items-end gap-4 flex-wrap transition-opacity ${
          isSearching ? "opacity-60" : ""
        }`}
      >
        <div className="w-36">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium">
            Dari Tanggal
          </label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setLimit(SALES_PAGE_SIZE);
            }}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
          />
        </div>
        <div className="w-36">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium">
            Sampai Tanggal
          </label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={todayStr()}
            onChange={(e) => {
              setDateTo(e.target.value);
              setLimit(SALES_PAGE_SIZE);
            }}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
            <Store size={13} strokeWidth={1.75} className="text-neutral-500" />
            Toko
          </label>
          <select
            value={storeFilter}
            onChange={(e) => {
              setStoreFilter(e.target.value);
              setLimit(SALES_PAGE_SIZE);
            }}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
          >
            <option value="">Semua Toko Saya</option>
            {myStores.map((s: any) => (
              <option key={s.id} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium">
            Status
          </label>
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value as StageFilter);
              setLimit(SALES_PAGE_SIZE);
            }}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredHistory.length > 0 && (
        <div className="bg-accent-500/10 border border-accent-500/20 rounded-lg px-4 py-2.5 mb-4 text-sm text-neutral-300">
          <span className="text-accent-400 font-semibold tabular-nums">
            {totalQty} pcs
          </span>{" "}
          dari {grouped.length} resi
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 mb-4 text-sm text-red-300">
          Data gagal dimuat: {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && isIncomplete && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 mb-4 text-sm text-amber-200">
          Baru menampilkan {salesHistory.length} dari {totalRows} item{" "}
          {isSearching ? "hasil pencarian" : "di rentang ini"}, jadi angka di
          atas belum lengkap.
          {!canLoadMore &&
            (isSearching
              ? " Datanya melebihi batas tampilan -- ketik nomor yang lebih lengkap untuk mempersempit."
              : " Datanya melebihi batas tampilan — persempit rentang tanggal atau pilih satu toko untuk melihat sisanya.")}
        </div>
      )}

      {/* List transaksi -- dikelompokkan per pesanan */}
      <div className="space-y-2">
        {grouped.map((g: any) => (
          <div
            key={g.key}
            className={`border rounded-xl p-3 hover:border-accent-500/50 transition-colors duration-200 ${STAGE_META[g.stage as SaleStage].card}`}
          >
            <div className="flex items-start justify-between mb-2.5 gap-3">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <span>{g.store}</span>
                <span>·</span>
                <span>
                  {new Date(g.sold_at).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {g.trackingNo && (
                  <CopyChip
                    label="No. Resi"
                    value={g.trackingNo}
                    copied={copiedNumber === g.trackingNo}
                    onCopy={copyNumber}
                  />
                )}
                {g.orderNo && (
                  <CopyChip
                    label="No. Pesanan"
                    value={g.orderNo}
                    copied={copiedNumber === g.orderNo}
                    onCopy={copyNumber}
                  />
                )}
                {!g.trackingNo && !g.orderNo && (
                  <span className="text-xs text-neutral-500">-</span>
                )}
              </div>
            </div>

            <StageBadge
              stage={g.stage}
              soldAt={g.sold_at}
              packedAt={g.packed_at}
              packedBy={g.packed_by}
              cancelledAt={g.cancelled_at}
            />

            <div className="space-y-1.5">
              {g.items.map((it: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  {it.photo ? (
                    <img
                      src={it.photo}
                      alt={it.product}
                      loading="lazy"
                      className="w-24 aspect-video rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-24 aspect-video rounded-lg bg-black/30 flex items-center justify-center shrink-0">
                      <Package
                        size={18}
                        strokeWidth={1.5}
                        className="text-neutral-600"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-100 truncate">
                      {it.product}
                    </p>
                    <p className="text-xs text-neutral-500">{it.qty} pcs</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tombol tandai manual -- hanya di kartu kuning & hijau.
                Kartu merah (retur), ungu (menunggu balik) dan abu-abu
                (dibatalkan) sudah final, jadi tidak ada tombol. */}
            {!readOnly &&
              (g.stage === "belum_siap" ||
                g.stage === "siap_kirim" ||
                g.stage === "lama") && (
                <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-white/5">
                  {g.stage === "belum_siap" && (
                    <button
                      onClick={() => markShipped(g)}
                      disabled={busyKey === g.key}
                      className="px-2.5 py-1 rounded-md text-[11px] border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                    >
                      Tandai Dikirim
                    </button>
                  )}
                  <button
                    onClick={() => markCancelled(g)}
                    disabled={busyKey === g.key}
                    className="px-2.5 py-1 rounded-md text-[11px] border border-line text-neutral-400 hover:text-red-300 hover:border-red-500/40 disabled:opacity-40 transition-colors"
                  >
                    Tandai Batal
                  </button>
                </div>
              )}
          </div>
        ))}

        {!loading && filteredHistory.length === 0 && (
          <p className="text-neutral-500 text-sm text-center py-10">
            {isSearching
              ? "Tidak ada transaksi dengan nomor tersebut"
              : "Belum ada penjualan di rentang tanggal ini"}
          </p>
        )}

        {loading && (
          <p className="text-neutral-500 text-sm text-center py-10 flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Memuat...
          </p>
        )}
      </div>

      {!loading && canLoadMore && (
        <button
          onClick={() =>
            setLimit((l) => Math.min(l + SALES_PAGE_SIZE, SALES_MAX_ROWS))
          }
          className="w-full mt-4 py-2.5 rounded-lg border border-line text-sm text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
        >
          Muat lebih banyak
        </button>
      )}
    </div>
  );
}
