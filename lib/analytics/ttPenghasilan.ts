// lib/analytics/ttPenghasilan.ts
// Tab Penghasilan TikTok: ke mana uang pergi dari pendapatan sampai dana bersih, untuk rentang
// tanggal DANA DILEPAS. Tanpa Next dan tanpa Supabase langsung, supaya bisa diuji (pola sama
// dengan harga.ts, panel.ts, dan iklan.ts). Angka dihitung di database (12_tiktok_penghasilan.sql);
// di sini hanya validasi, pengisian hari kosong, persentase, dan peringatan.
//
// Tanda angka sama dengan file TikTok: biaya negatif, pemasukan positif.
import type { StoreRow } from "./uploadHandler";

export type StoreRef = { id: string; code: string; name: string };
export type HandlerResult = { status: number; json: Record<string, unknown> };
export type DbResult = { data: unknown; error: string | null };

export interface TtPenghasilanDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  coverage(storeId: string): Promise<DbResult>; // tt_coverage
  summary(storeId: string, from: string, to: string): Promise<DbResult>; // tt_income_summary
  daily(storeId: string, from: string, to: string): Promise<DbResult>; // tt_income_daily
  qty(storeId: string, from: string, to: string): Promise<DbResult>; // tt_income_qty
  pending(storeId: string): Promise<DbResult>; // tt_pending_summary
}

export type Coverage = {
  incomeFirst: string | null;
  incomeLast: string | null;
  walletFirst: string | null;
  walletLast: string | null;
  ordersFirst: string | null;
  ordersLast: string | null;
  adsFirst: string | null;
  adsLast: string | null;
};

export type BreakdownRow = {
  key: string;
  label: string;
  amount: number; // bertanda, biaya negatif
  pctOfRevenue: number | null; // amount / pendapatan x 100
};

export type DayRow = {
  day: string;
  orders: number;
  settlement: number;
  adsCost: number;
};

export type TtPenghasilanData = {
  ok: true;
  empty: false;
  store: StoreRef;
  range: { from: string; to: string };
  coverage: Coverage;
  summary: {
    entries: number;
    orders: number;
    ordersWithFunds: number;
    ordersRefundedFully: number;
    ordersSettlement: number; // dana bersih dari pesanan saja, sebelum iklan dan penyesuaian
    subtotalBefore: number;
    sellerDiscount: number;
    subtotalAfter: number;
    refundAfter: number;
    revenue: number;
    totalFee: number;
    adsCost: number;
    otherAdjustment: number;
    settlement: number;
  };
  rates: {
    refundPct: number | null; // pengembalian dana dari subtotal setelah diskon
    sellerDiscountPct: number | null; // diskon penjual dari harga sebelum diskon
    feePct: number | null; // total biaya dari pendapatan
    adsPct: number | null; // iklan dari pendapatan
    netPct: number | null; // dana bersih dari pendapatan
  };
  perOrder: {
    beforeAds: number | null; // dana bersih pesanan per pesanan berdana, sebelum iklan
    afterAds: number | null; // sesudah iklan dan penyesuaian lain
    avgPcsPerOrder: number | null; // dari pesanan yang punya data pesanan (minimal 10)
    afterAdsPerPcs: number | null; // perkiraan: afterAds / avgPcsPerOrder
  };
  qty: {
    ordersWithFunds: number;
    ordersMatched: number;
    ordersUnknown: number;
  };
  breakdown: BreakdownRow[];
  daily: DayRow[];
  pending: { orders: number; subtotal: number; oldest: string | null };
  componentsDiff: number; // pendapatan + biaya + iklan + penyesuaian lain - dana bersih (harus 0)
  warnings: string[];
};
export type TtPenghasilanEmpty = {
  ok: true;
  empty: true;
  store: StoreRef;
  coverage: Coverage;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 400;
const DEFAULT_ALL_DATA_MAX_DAYS = 45;
const DEFAULT_RECENT_DAYS = 30;
const MIN_ORDERS_FOR_AVG_PCS = 10;

type Rec = Record<string, unknown>;
const first = (d: unknown): Rec | null =>
  Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null
    ? (d[0] as Rec)
    : null;
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
const dateOrNull = (v: unknown): string | null =>
  typeof v === "string" && DATE_RE.test(v.slice(0, 10)) ? v.slice(0, 10) : null;
const fail = (status: number, error: string): HandlerResult => ({
  status,
  json: { ok: false, error },
});
const validDate = (s: unknown): s is string =>
  typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");
const rp = (n: number): string => `Rp${nf(n)}`;
const pctOf = (a: number, b: number): number | null =>
  b === 0 ? null : (100 * a) / b;

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

function readCoverage(d: unknown): Coverage {
  const r = first(d) ?? {};
  return {
    incomeFirst: dateOrNull(r.income_first),
    incomeLast: dateOrNull(r.income_last),
    walletFirst: dateOrNull(r.wallet_first),
    walletLast: dateOrNull(r.wallet_last),
    ordersFirst: dateOrNull(r.orders_first),
    ordersLast: dateOrNull(r.orders_last),
    adsFirst: dateOrNull(r.ads_first),
    adsLast: dateOrNull(r.ads_last),
  };
}

// Rentang bawaan: seluruh data penghasilan kalau cakupannya tidak lebih dari 45 hari,
// kalau lebih = 30 hari terakhir (berakhir di tanggal data terakhir).
export function defaultRange(
  incomeFirst: string,
  incomeLast: string,
): { from: string; to: string } {
  const span = daysBetween(incomeFirst, incomeLast) + 1;
  if (span <= DEFAULT_ALL_DATA_MAX_DAYS)
    return { from: incomeFirst, to: incomeLast };
  return {
    from: addDays(incomeLast, -(DEFAULT_RECENT_DAYS - 1)),
    to: incomeLast,
  };
}

export async function handleTtPenghasilan(
  deps: TtPenghasilanDeps,
  admin: string | null,
  q: { store?: string | null; from?: string | null; to?: string | null },
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  const storeId = q.store;
  if (typeof storeId !== "string" || !UUID_RE.test(storeId))
    return fail(400, "Pilih toko dulu.");
  const store = await deps.getStore(storeId);
  if (!store || store.marketplace !== "tiktok" || store.managed_by !== admin)
    return fail(403, "Toko ini bukan toko TikTok milikmu.");
  const ref: StoreRef = { id: store.id, code: store.code, name: store.name };

  const covRes = await deps.coverage(store.id);
  if (covRes.error)
    return fail(500, `Gagal membaca cakupan data: ${covRes.error}`);
  const coverage = readCoverage(covRes.data);
  if (!coverage.incomeFirst || !coverage.incomeLast) {
    const empty: TtPenghasilanEmpty = {
      ok: true,
      empty: true,
      store: ref,
      coverage,
    };
    return { status: 200, json: empty };
  }

  // rentang
  let from: string;
  let to: string;
  const hasFrom = q.from != null && q.from !== "";
  const hasTo = q.to != null && q.to !== "";
  if (hasFrom || hasTo) {
    if (!validDate(q.from) || !validDate(q.to))
      return fail(400, "Tanggal tidak valid. Isi kedua tanggal dengan benar.");
    from = q.from;
    to = q.to;
    if (from > to)
      return fail(400, "Tanggal 'Dari' tidak boleh sesudah 'Sampai'.");
    if (daysBetween(from, to) + 1 > MAX_DAYS)
      return fail(400, `Rentang terlalu panjang (maksimal ${MAX_DAYS} hari).`);
  } else {
    ({ from, to } = defaultRange(coverage.incomeFirst, coverage.incomeLast));
  }

  const [sumRes, dayRes, qtyRes, pendRes] = await Promise.all([
    deps.summary(store.id, from, to),
    deps.daily(store.id, from, to),
    deps.qty(store.id, from, to),
    deps.pending(store.id),
  ]);
  for (const [name, r] of [
    ["ringkasan", sumRes],
    ["harian", dayRes],
    ["jumlah pcs", qtyRes],
    ["dana menunggu cair", pendRes],
  ] as const) {
    if (r.error) return fail(500, `Gagal membaca data ${name}: ${r.error}`);
  }

  const s = first(sumRes.data) ?? {};
  const summary = {
    entries: num(s.entries),
    orders: num(s.orders),
    ordersWithFunds: num(s.orders_with_funds),
    ordersRefundedFully: num(s.orders_refunded_fully),
    ordersSettlement: num(s.orders_settlement),
    subtotalBefore: num(s.subtotal_before),
    sellerDiscount: num(s.seller_discount),
    subtotalAfter: num(s.subtotal_after),
    refundAfter: num(s.refund_after),
    revenue: num(s.revenue),
    totalFee: num(s.total_fee),
    adsCost: num(s.ads_cost),
    otherAdjustment: num(s.other_adjustment),
    settlement: num(s.settlement),
  };

  const pc = (amount: number) => pctOf(amount, summary.revenue);
  const feeItems: [string, string, number][] = [
    ["fee_commission", "Komisi platform", num(s.fee_commission)],
    ["fee_dynamic", "Komisi dinamis", num(s.fee_dynamic)],
    ["fee_affiliate", "Komisi afiliasi", num(s.fee_affiliate)],
    [
      "fee_affiliate_ads",
      "Komisi iklan toko afiliasi",
      num(s.fee_affiliate_ads),
    ],
    ["fee_growth_xtra", "Layanan Program Growth Xtra", num(s.fee_growth_xtra)],
    ["fee_payment", "Biaya pembayaran", num(s.fee_payment)],
    ["fee_processing", "Pemrosesan pesanan", num(s.fee_processing)],
    ["shipping_net", "Ongkir bersih", num(s.shipping_net)],
    ["tax_pph22", "PPh Pasal 22", num(s.tax_pph22)],
    ["fee_gmv_max", "Biaya iklan GMV Max", num(s.fee_gmv_max)],
    ["fee_other", "Biaya jenis lain", num(s.fee_other)],
  ];
  const breakdown: BreakdownRow[] = feeItems
    .filter(([key, , amount]) => amount !== 0 || key === "fee_commission")
    .map(([key, label, amount]) => ({
      key,
      label,
      amount,
      pctOfRevenue: pc(amount),
    }));

  // hari kosong diisi nol supaya grafik utuh
  const byDay = new Map<string, DayRow>();
  for (const r of rowsOf(dayRes.data)) {
    const day = dateOrNull(r.day);
    if (!day) continue;
    byDay.set(day, {
      day,
      orders: num(r.orders),
      settlement: num(r.settlement),
      adsCost: num(r.ads_cost),
    });
  }
  const daily: DayRow[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    daily.push(
      byDay.get(d) ?? { day: d, orders: 0, settlement: 0, adsCost: 0 },
    );
  }

  const qr = first(qtyRes.data) ?? {};
  const ordersWithFunds = num(qr.orders_with_funds);
  const ordersMatched = num(qr.orders_matched);
  const pcsMatched = num(qr.pcs_matched);
  const avgPcs =
    ordersMatched >= MIN_ORDERS_FOR_AVG_PCS && pcsMatched > 0
      ? pcsMatched / ordersMatched
      : null;
  const beforeAds =
    ordersWithFunds > 0 ? summary.ordersSettlement / ordersWithFunds : null;
  const afterAds =
    ordersWithFunds > 0 ? summary.settlement / ordersWithFunds : null;

  const pr = first(pendRes.data) ?? {};
  const pending = {
    orders: num(pr.orders),
    subtotal: num(pr.subtotal),
    oldest: dateOrNull(pr.oldest),
  };

  const componentsDiff =
    summary.revenue +
    summary.totalFee +
    summary.adsCost +
    summary.otherAdjustment -
    summary.settlement;

  const warnings: string[] = [];
  if (to < coverage.incomeFirst || from > coverage.incomeLast) {
    warnings.push(
      `Rentang ini di luar data penghasilan yang tersimpan (${coverage.incomeFirst} sampai ${coverage.incomeLast}).`,
    );
  } else if (from < coverage.incomeFirst || to > coverage.incomeLast) {
    warnings.push(
      `Data penghasilan yang tersimpan hanya ${coverage.incomeFirst} sampai ${coverage.incomeLast}; angka di luar tanggal itu belum ada.`,
    );
  }
  const unknown = ordersWithFunds - ordersMatched;
  if (unknown > 0) {
    warnings.push(
      `${nf(unknown)} dari ${nf(ordersWithFunds)} pesanan berdana di rentang ini dibuat sebelum data pesanan yang tersimpan${coverage.ordersFirst ? ` (mulai ${coverage.ordersFirst})` : ""}, jadi jumlah pcs-nya tidak diketahui. Perkiraan per pcs hanya memakai rata-rata dari pesanan yang diketahui.`,
    );
  }
  if (Math.abs(componentsDiff) > 1) {
    warnings.push(
      `Pendapatan + biaya + iklan + penyesuaian (${rp(summary.revenue + summary.totalFee + summary.adsCost + summary.otherAdjustment)}) tidak sama dengan dana bersih (${rp(summary.settlement)}). Ada komponen yang belum terbaca.`,
    );
  }
  const otherFee = num(s.fee_other);
  if (Math.abs(otherFee) > 1) {
    warnings.push(
      `Ada biaya jenis lain ${rp(-otherFee)} yang belum punya baris sendiri di tabel. TikTok mungkin menambah jenis biaya baru.`,
    );
  }

  const data: TtPenghasilanData = {
    ok: true,
    empty: false,
    store: ref,
    range: { from, to },
    coverage,
    summary,
    rates: {
      refundPct: pctOf(-summary.refundAfter, summary.subtotalAfter),
      sellerDiscountPct: pctOf(-summary.sellerDiscount, summary.subtotalBefore),
      feePct: pctOf(-summary.totalFee, summary.revenue),
      adsPct: pctOf(-summary.adsCost, summary.revenue),
      netPct: pctOf(summary.settlement, summary.revenue),
    },
    perOrder: {
      beforeAds,
      afterAds,
      avgPcsPerOrder: avgPcs,
      afterAdsPerPcs: afterAds != null && avgPcs ? afterAds / avgPcs : null,
    },
    qty: {
      ordersWithFunds,
      ordersMatched,
      ordersUnknown: Math.max(0, unknown),
    },
    breakdown,
    daily,
    pending,
    componentsDiff,
    warnings,
  };
  return { status: 200, json: data };
}
