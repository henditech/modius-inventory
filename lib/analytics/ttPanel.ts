// lib/analytics/ttPanel.ts
// Panel target TikTok: "untung atau tidak setelah iklan" per produk. Tanpa Next dan tanpa
// Supabase langsung, supaya bisa diuji (pola sama dengan panel.ts untuk Shopee).
//
// Angka per produk dihitung di database (fungsi tt_panel_products, 17_tiktok_panel.sql).
// Status dihitung oleh statusOf dari panel.ts, jadi aturan status dan target kerja SAMA
// dengan Shopee. Menyimpan target memakai handleSetTarget milik Shopee (lewat pembungkus di
// bawah) supaya aturan targetnya tidak mungkin berbeda.
//
// PERBEDAAN dengan Shopee: file iklan TikTok hanya berisi biaya per HARI untuk seluruh toko,
// bukan per produk. Biaya iklan per produk di sini adalah pembagian rata per pcs, bukan biaya
// sebenarnya produk itu. Halaman memberi tahu hal ini.
import { isIsoDate } from "./danaRange";
import {
  MIN_COVERAGE_PCT,
  MIN_ORDERS,
  STATUS_ORDER,
  handleSetTarget,
  resolveTarget,
  statusOf,
  type DbResult,
  type HandlerResult,
  type PanelData,
  type PanelDeps,
  type PanelRow,
  type Status,
  type StoreRef,
  type TargetHistoryItem,
  type TargetRow,
} from "./panel";
import type { StoreRow } from "./uploadHandler";

// Sama dengan "limit 300" di tt_panel_products (17_tiktok_panel.sql).
export const TT_PANEL_PRODUCT_LIMIT = 300;

export type TtPanelCoverage = {
  ordersFirst: string;
  ordersLast: string;
  adsFirst: string | null;
  adsLast: string | null;
  incomeLast: string | null;
};

export type TtPanelData = {
  ok: true;
  empty: false;
  store: StoreRef;
  period: { start: string; end: string };
  coverage: TtPanelCoverage;
  rules: { minOrders: number; minCoveragePct: number };
  targets: PanelData["targets"];
  summary: PanelData["summary"] & { adCostPerUnit: number | null };
  rows: PanelRow[];
  warnings: string[];
};
export type TtPanelEmpty = { ok: true; empty: true; store: StoreRef };

export interface TtPanelDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  coverage(storeId: string): Promise<DbResult>; // tt_coverage
  products(storeId: string, from: string, to: string): Promise<DbResult>; // tt_panel_products
  targets(storeId: string): Promise<DbResult>; // target kerja dan bos: milik toko, plus yang umum
  findTarget: PanelDeps["findTarget"];
  insertTarget: PanelDeps["insertTarget"];
  updateTarget: PanelDeps["updateTarget"];
  now(): number;
}

// ------------------------------------------------------------------ pembantu

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Rec = Record<string, unknown>;
const rowsOf = (d: unknown): Rec[] => (Array.isArray(d) ? (d as Rec[]) : []);
const firstRow = (d: unknown): Rec | null => rowsOf(d)[0] ?? null;
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

const parseTarget = (x: Rec): TargetRow | null => {
  const kind = x.kind === "kerja" || x.kind === "bos" ? x.kind : null;
  const eff = dateOnly(x.effective_from);
  const target = numOrNull(x.target);
  if (!kind || !eff || target == null) return null;
  return {
    id: num(x.id),
    storeId: str(x.store_id),
    productId: str(x.product_id),
    kind,
    target,
    effectiveFrom: eff,
    note: str(x.note),
    updatedBy: str(x.updated_by) ?? "-",
    updatedAt: str(x.updated_at),
  };
};

// Toko harus dikelola admin yang login dan memang toko TikTok. Toko orang lain dan toko yang
// tidak ada dijawab sama (404) supaya ID toko tidak bisa ditebak.
async function ownedTtStore(
  deps: TtPanelDeps,
  admin: string,
  storeId: unknown,
): Promise<{ store: StoreRow } | { error: HandlerResult }> {
  if (typeof storeId !== "string" || !UUID_RE.test(storeId))
    return { error: fail(400, "Pilih toko dulu.") };
  const store = await deps.getStore(storeId);
  if (!store || store.marketplace !== "tiktok" || store.managed_by !== admin)
    return { error: fail(404, "Toko tidak ditemukan.") };
  return { store };
}

// ------------------------------------------------------------------ baca panel

export type TtPanelQuery = {
  store?: string | null;
  from?: string | null;
  to?: string | null;
};

export async function handleTtPanel(
  deps: TtPanelDeps,
  admin: string | null,
  q: TtPanelQuery,
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  const owned = await ownedTtStore(deps, admin, q.store);
  if ("error" in owned) return owned.error;
  const store = owned.store;
  const ref: StoreRef = { id: store.id, code: store.code, name: store.name };

  const cov = await deps.coverage(store.id);
  if (cov.error) return fail(500, "Gagal memuat cakupan data.");
  const c = firstRow(cov.data);
  const ordersFirst = str(c?.orders_first);
  const ordersLast = str(c?.orders_last);
  if (!ordersFirst || !ordersLast) {
    const empty: TtPanelEmpty = { ok: true, empty: true, store: ref };
    return { status: 200, json: empty };
  }
  const coverage: TtPanelCoverage = {
    ordersFirst,
    ordersLast,
    adsFirst: str(c?.ads_first),
    adsLast: str(c?.ads_last),
    incomeLast: str(c?.income_last),
  };

  // Bawaan: bulan terakhir yang ada pesanannya (dari tanggal 1 bulan itu, atau awal data).
  const monthStart = `${ordersLast.slice(0, 7)}-01`;
  const from = q.from ?? (monthStart > ordersFirst ? monthStart : ordersFirst);
  const to = q.to ?? ordersLast;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to)
    return fail(400, "Rentang tanggal tidak valid.");

  const [prod, tgt] = await Promise.all([
    deps.products(store.id, from, to),
    deps.targets(store.id),
  ]);
  if (prod.error) return fail(500, "Gagal membaca data panel.");
  if (tgt.error) return fail(500, "Gagal membaca target.");

  const targetRows = rowsOf(tgt.data)
    .map(parseTarget)
    .filter((t): t is TargetRow => t !== null);
  const kerjaT = resolveTarget(targetRows, {
    kind: "kerja",
    storeId: store.id,
    periodStart: from,
  });
  const bosT = resolveTarget(targetRows, {
    kind: "bos",
    storeId: store.id,
    periodStart: from,
  });

  const rows: PanelRow[] = rowsOf(prod.data).map((x) => {
    const base = {
      validOrders: num(x.valid_orders),
      coveragePct: numOrNull(x.coverage_pct),
      adCost: num(x.ad_cost),
      netAfterAds: numOrNull(x.net_after_ads),
    };
    const productId = str(x.sku) ?? "-";
    // Target khusus produk (kalau ada) mengalahkan target toko.
    const k = resolveTarget(targetRows, {
      kind: "kerja",
      storeId: store.id,
      productId,
      periodStart: from,
    });
    const b = resolveTarget(targetRows, {
      kind: "bos",
      storeId: store.id,
      productId,
      periodStart: from,
    });
    const kt = k ? k.target : null;
    return {
      productId,
      productName: str(x.product),
      validOrders: base.validOrders,
      validUnits: num(x.valid_units),
      cancelPct: numOrNull(x.cancel_pct),
      releasedOrders: num(x.released_orders),
      releasedUnits: num(x.released_units),
      coveragePct: base.coveragePct,
      avgIncome: numOrNull(x.avg_income),
      adCost: base.adCost,
      adCostPerUnit: numOrNull(x.ad_cost_per_unit),
      netAfterAds: base.netAfterAds,
      estTotal: numOrNull(x.est_total),
      status: statusOf(base, kt),
      gap:
        base.netAfterAds != null && kt != null ? base.netAfterAds - kt : null,
      bossStatus: b ? statusOf(base, b.target) : null,
    };
  });
  rows.sort(
    (a, b) =>
      b.validUnits - a.validUnits ||
      b.adCost - a.adCost ||
      a.productId.localeCompare(b.productId),
  );

  const statusCounts = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, 0]),
  ) as Record<Status, number>;
  for (const r of rows) statusCounts[r.status]++;
  const validUnits = rows.reduce((a, r) => a + r.validUnits, 0);
  const releasedUnits = rows.reduce((a, r) => a + r.releasedUnits, 0);
  const coveragePct =
    validUnits > 0 ? Math.round((100 * releasedUnits) / validUnits) : null;
  const adCostPerUnit =
    rows.map((r) => r.adCostPerUnit).find((v) => v != null) ?? null;

  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push("Tidak ada pesanan di rentang ini.");
  } else if (from < ordersFirst || to > ordersLast) {
    warnings.push(
      "Rentang melewati data pesanan yang tersimpan. Pesanan di luar periode itu belum diupload dan tidak ikut dihitung.",
    );
  }
  if (!coverage.adsFirst || !coverage.adsLast) {
    warnings.push(
      "Belum ada data iklan TikTok untuk toko ini. Biaya iklan dianggap Rp0, jadi bersih setelah iklan terlalu tinggi. Upload file Campaign overview di tab Upload.",
    );
  } else if (from < coverage.adsFirst || to > coverage.adsLast) {
    warnings.push(
      "Data iklan baru tersimpan untuk sebagian rentang ini. Hari yang tidak punya data iklan dianggap tanpa biaya, jadi bersih setelah iklan terlalu tinggi.",
    );
  }
  if (!coverage.incomeLast) {
    warnings.push(
      "Belum ada data penghasilan TikTok untuk toko ini, jadi bersih per pcs belum bisa dihitung. Upload file income di tab Upload.",
    );
  } else if (coveragePct != null && coveragePct < MIN_COVERAGE_PCT) {
    warnings.push(
      `Dana baru cair untuk ${coveragePct}% pcs di rentang ini. Bersih per pcs baru layak dinilai kalau dana sudah cair lebih dari ${MIN_COVERAGE_PCT}%.`,
    );
  }
  if (rows.length >= TT_PANEL_PRODUCT_LIMIT) {
    warnings.push(
      `Daftar produk dipotong di ${TT_PANEL_PRODUCT_LIMIT} produk. Angka lain tetap dihitung dari semua pesanan.`,
    );
  }

  const history: TargetHistoryItem[] = targetRows
    .filter(
      (t) =>
        t.kind === "kerja" && t.storeId === store.id && t.productId === null,
    )
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
    .slice(0, 20)
    .map((t) => ({
      target: t.target,
      effectiveFrom: t.effectiveFrom,
      note: t.note,
      updatedBy: t.updatedBy,
      updatedAt: t.updatedAt,
    }));

  const data: TtPanelData = {
    ok: true,
    empty: false,
    store: ref,
    period: { start: from, end: to },
    coverage,
    rules: { minOrders: MIN_ORDERS, minCoveragePct: MIN_COVERAGE_PCT },
    targets: {
      kerja: kerjaT ? kerjaT.target : null,
      kerjaFrom: kerjaT ? kerjaT.effectiveFrom : null,
      bos: bosT ? bosT.target : null,
      history,
    },
    summary: {
      products: rows.length,
      validUnits,
      adCost: rows.reduce((a, r) => a + r.adCost, 0),
      estTotal: rows.reduce((a, r) => a + (r.estTotal ?? 0), 0),
      coveragePct,
      statusCounts,
      adCostPerUnit,
    },
    rows,
    warnings,
  };
  return { status: 200, json: data };
}

// ------------------------------------------------------------------ simpan target kerja

// Aturan menyimpan target (batas nilai, tanggal berlaku, riwayat, hanya target kerja) SAMA
// dengan Shopee, karena memakai handleSetTarget yang sama. handleSetTarget hanya menerima toko
// Shopee, jadi toko TikTok yang SUDAH lolos pemeriksaan di sini diteruskan dengan penanda
// marketplace "shopee" (hanya di dalam pemanggilan ini, tidak mengubah data toko).
export async function handleSetTtTarget(
  deps: TtPanelDeps,
  admin: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return fail(400, "Permintaan tidak valid.");

  const owned = await ownedTtStore(deps, admin, (body as Rec).store);
  if ("error" in owned) return owned.error;

  // handleSetTarget hanya memakai lima fungsi ini dari PanelDeps.
  const asShopeeDeps = {
    getStore: async (id: string) => {
      const s = await deps.getStore(id);
      return s && s.marketplace === "tiktok"
        ? { ...s, marketplace: "shopee" }
        : null;
    },
    findTarget: deps.findTarget,
    insertTarget: deps.insertTarget,
    updateTarget: deps.updateTarget,
    now: deps.now,
  } as unknown as PanelDeps;
  return handleSetTarget(asShopeeDeps, admin, body);
}
