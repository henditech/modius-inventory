// lib/analytics/harga.ts
// Tab Harga: harga jual vs jumlah pcs terjual, per produk dan per pita harga (dibulatkan ke
// Rp5.000, lihat view price_volume di 02_views.sql). Tanpa Next dan tanpa Supabase langsung,
// supaya bisa diuji (pola sama dengan panel.ts dan iklan.ts).
//
// Cara membaca: tiap baris adalah satu produk di satu pita harga. Pcs adalah PERMINTAAN
// (termasuk yang kemudian batal). Bersih per pcs adalah sebelum iklan, dari pesanan yang
// dananya sudah dilepas. Perbandingan antar pita bersifat berurutan waktu, bukan percobaan
// terkontrol: promo, iklan, dan hari ramai ikut memengaruhi.
import type { StoreRow } from "./uploadHandler";

// Pita lain dianggap lebih baik kalau bersih per hari-nya lebih tinggi sekurang-kurangnya ini.
export const BETTER_BAND_MIN_GAIN_PCT = 10;
// Pita hanya dibandingkan kalau dananya sudah cair sekurang-kurangnya ini (persen dari pcs valid).
export const MIN_RELEASED_PCT = 50;

export type StoreRef = { id: string; code: string; name: string };

export type Band = {
  priceBand: number; // dibulatkan ke Rp5.000
  priceMin: number; // harga sebenarnya terendah di pita ini
  priceMax: number;
  firstDay: string;
  lastDay: string;
  daysSold: number; // hari yang ada penjualannya di pita ini
  allOrders: number;
  allUnits: number; // permintaan, termasuk yang batal
  validUnits: number;
  cancelPct: number | null;
  unitsPerDay: number | null; // permintaan per hari terjual
  avgIncome: number | null; // bersih per pcs sebelum iklan
  releasedOrders: number;
  releasedPct: number | null; // perkiraan dana cair: pesanan cair / pcs valid, maksimum 100
  comparable: boolean; // dana cair minimal MIN_RELEASED_PCT
  estNetPerDay: number | null; // pcs valid per hari x bersih per pcs, sebelum iklan
  enoughData: boolean; // minimal 3 hari dan 10 pesanan
  isCurrent: boolean; // pita yang terakhir dipakai
  isBest: boolean; // bersih per hari tertinggi di antara pita yang cukup datanya
};

export type PriceHint = {
  bestBand: number;
  currentBand: number;
  gainPct: number; // bersih per hari pita terbaik dibanding pita sekarang
};

export type ProductPrice = {
  productId: string;
  productName: string | null;
  bands: Band[]; // harga terendah dulu
  multiBand: boolean;
  totalUnits: number; // permintaan seluruh pita
  hint: PriceHint | null;
};

export type HargaData = {
  ok: true;
  empty: false;
  store: StoreRef;
  products: ProductPrice[];
  summary: {
    products: number;
    multiBand: number;
    withHint: number;
    bandsWithoutIncome: number;
    bandsLowFunds: number;
  };
  rules: {
    minDays: number;
    minOrders: number;
    minGainPct: number;
    minReleasedPct: number;
  };
  warnings: string[];
};
export type HargaEmpty = { ok: true; empty: true; store: StoreRef };

export type HandlerResult = { status: number; json: Record<string, unknown> };
export type DbResult = { data: unknown; error: string | null };

export interface HargaDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  priceRows(storeId: string): Promise<DbResult>; // view price_volume, semua pita
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Rec = Record<string, unknown>;
const rowsOf = (d: unknown): Rec[] => (Array.isArray(d) ? (d as Rec[]) : []);
const num = (v: unknown): number => {
  const x =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const dateOnly = (v: unknown): string | null =>
  typeof v === "string" ? v.slice(0, 10) : null;
const fail = (status: number, error: string): HandlerResult => ({
  status,
  json: { ok: false, error },
});
const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");

// Pita "sekarang" = yang paling akhir dipakai; kalau sama, yang mulai paling akhir.
export function currentBandOf(bands: Band[]): Band | null {
  if (bands.length === 0) return null;
  return [...bands].sort(
    (a, b) =>
      (a.lastDay < b.lastDay ? 1 : a.lastDay > b.lastDay ? -1 : 0) ||
      (a.firstDay < b.firstDay ? 1 : a.firstDay > b.firstDay ? -1 : 0) ||
      b.priceBand - a.priceBand,
  )[0];
}

// Pita terbaik = bersih per hari tertinggi di antara pita yang cukup datanya. Hanya ada kalau
// minimal dua pita yang cukup datanya (kalau tidak, tidak ada yang bisa dibandingkan).
export function bestBandOf(bands: Band[]): Band | null {
  const ok = bands.filter(
    (b) => b.enoughData && b.comparable && b.estNetPerDay != null,
  );
  if (ok.length < 2) return null;
  return [...ok].sort(
    (a, b) =>
      (b.estNetPerDay as number) - (a.estNetPerDay as number) ||
      a.priceBand - b.priceBand,
  )[0];
}

export async function handleHarga(
  deps: HargaDeps,
  admin: string | null,
  q: { store?: string | null },
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  const storeId = q.store;
  if (typeof storeId !== "string" || !UUID_RE.test(storeId))
    return fail(400, "Pilih toko dulu.");
  const store = await deps.getStore(storeId);
  if (!store || store.marketplace !== "shopee" || store.managed_by !== admin)
    return fail(403, "Toko ini bukan toko Shopee milikmu.");
  const ref: StoreRef = { id: store.id, code: store.code, name: store.name };

  const res = await deps.priceRows(store.id);
  if (res.error) return fail(500, `Gagal membaca data harga: ${res.error}`);
  const rows = rowsOf(res.data);
  if (rows.length === 0) {
    const empty: HargaEmpty = { ok: true, empty: true, store: ref };
    return { status: 200, json: empty };
  }

  // Kelompokkan per produk.
  const byProduct = new Map<string, { name: string | null; bands: Band[] }>();
  for (const x of rows) {
    const productId = str(x.product_id);
    const firstDay = dateOnly(x.first_day);
    const lastDay = dateOnly(x.last_day);
    if (!productId || !firstDay || !lastDay) continue;
    const cur = byProduct.get(productId) ?? {
      name: str(x.product_name),
      bands: [],
    };

    const validUnits = num(x.valid_units);
    const releasedOrders = num(x.released_orders);
    const releasedPct =
      validUnits > 0
        ? Math.min(100, (100 * releasedOrders) / validUnits)
        : null;
    cur.bands.push({
      priceBand: num(x.price_band),
      priceMin: num(x.price_min),
      priceMax: num(x.price_max),
      firstDay,
      lastDay,
      daysSold: num(x.days_sold),
      allOrders: num(x.all_orders),
      allUnits: num(x.all_units),
      validUnits,
      releasedOrders,
      releasedPct,
      comparable: releasedPct != null && releasedPct >= MIN_RELEASED_PCT,
      cancelPct: numOrNull(x.cancel_pct),
      unitsPerDay: numOrNull(x.units_per_day),
      avgIncome: numOrNull(x.avg_income),
      estNetPerDay: numOrNull(x.est_net_per_day),
      enoughData: x.enough_data === true,
      isCurrent: false,
      isBest: false,
    });
    byProduct.set(productId, cur);
  }

  const products: ProductPrice[] = [];
  let bandsWithoutIncome = 0;
  let bandsLowFunds = 0;
  for (const [productId, p] of byProduct) {
    const bands = p.bands.sort((a, b) => a.priceBand - b.priceBand);
    const current = currentBandOf(bands);
    const best = bestBandOf(bands);
    if (current) current.isCurrent = true;
    if (best) best.isBest = true;
    bandsWithoutIncome += bands.filter((b) => b.avgIncome == null).length;
    bandsLowFunds += bands.filter((b) => !b.comparable).length;

    let hint: PriceHint | null = null;
    if (
      current &&
      best &&
      best.priceBand !== current.priceBand &&
      current.enoughData &&
      current.comparable &&
      current.estNetPerDay != null &&
      current.estNetPerDay > 0 &&
      best.estNetPerDay != null
    ) {
      const gain =
        (100 * (best.estNetPerDay - current.estNetPerDay)) /
        current.estNetPerDay;
      if (gain >= BETTER_BAND_MIN_GAIN_PCT)
        hint = {
          bestBand: best.priceBand,
          currentBand: current.priceBand,
          gainPct: gain,
        };
    }
    products.push({
      productId,
      productName: p.name,
      bands,
      multiBand: bands.length > 1,
      totalUnits: bands.reduce((a, b) => a + b.allUnits, 0),
      hint,
    });
  }
  products.sort(
    (a, b) =>
      b.totalUnits - a.totalUnits || a.productId.localeCompare(b.productId),
  );

  const warnings: string[] = [];
  if (bandsWithoutIncome > 0)
    warnings.push(
      `${nf(bandsWithoutIncome)} pita harga belum punya pesanan yang dananya cair, jadi bersih per pcs dan per hari-nya kosong.`,
    );
  if (bandsLowFunds > 0)
    warnings.push(
      `${nf(bandsLowFunds)} pita harga dananya baru cair kurang dari ${MIN_RELEASED_PCT}%, jadi tidak dibandingkan dan tidak dipakai untuk saran harga.`,
    );

  const data: HargaData = {
    ok: true,
    empty: false,
    store: ref,
    products,
    summary: {
      products: products.length,
      multiBand: products.filter((p) => p.multiBand).length,
      withHint: products.filter((p) => p.hint != null).length,
      bandsWithoutIncome,
      bandsLowFunds,
    },
    rules: {
      minDays: 3,
      minOrders: 10,
      minGainPct: BETTER_BAND_MIN_GAIN_PCT,
      minReleasedPct: MIN_RELEASED_PCT,
    },
    warnings,
  };
  return { status: 200, json: data };
}
