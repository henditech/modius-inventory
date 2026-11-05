// lib/analytics/panel.ts
// Panel target: "untung atau tidak setelah iklan" per produk per periode iklan.
// Tanpa Next dan tanpa Supabase langsung, supaya bisa diuji (pola sama dengan dana.ts).
//
// Angka per pcs dihitung di database (view panel_product_period). Status dihitung DI SINI
// oleh satu fungsi, statusOf, yang menerima target sebagai parameter. Fungsi yang sama
// dipakai browser untuk mode simulasi (target ketikan sendiri, tidak disimpan), jadi
// simulasi dan target resmi tidak mungkin berbeda aturan.
import { isIsoDate, todayWib } from "./danaRange";
import type { StoreRow } from "./uploadHandler";

// ------------------------------------------------------------------ status

export type Status =
  | "RUGI"
  | "SAMPEL_KECIL"
  | "DATA_BELUM_LENGKAP"
  | "TARGET_BELUM_DIISI"
  | "DI_BAWAH_TARGET"
  | "MASUK_TARGET";

export const STATUS_LABEL: Record<Status, string> = {
  RUGI: "Rugi",
  SAMPEL_KECIL: "Sampel kecil",
  DATA_BELUM_LENGKAP: "Data belum lengkap",
  TARGET_BELUM_DIISI: "Target belum diisi",
  DI_BAWAH_TARGET: "Di bawah target",
  MASUK_TARGET: "Masuk target",
};
export const STATUS_ORDER: Status[] = [
  "MASUK_TARGET",
  "DI_BAWAH_TARGET",
  "RUGI",
  "SAMPEL_KECIL",
  "DATA_BELUM_LENGKAP",
  "TARGET_BELUM_DIISI",
];

// Pesanan valid minimal agar angka per pcs dianggap cukup bisa dipercaya.
export const MIN_ORDERS = 10;
// Persentase pcs yang dananya sudah dilepas, minimal, agar "bersih per pcs" dianggap layak.
export const MIN_COVERAGE_PCT = 50;

export type StatusInput = {
  validOrders: number;
  coveragePct: number | null;
  adCost: number;
  netAfterAds: number | null;
};

// Aturan berurutan, yang pertama cocok menang:
//   1. RUGI                 ada biaya iklan dan bersih setelah iklan <= 0
//   2. SAMPEL_KECIL         pesanan valid < 10
//   3. DATA_BELUM_LENGKAP   bersih setelah iklan kosong, atau dana cair < 50% pcs
//   4. TARGET_BELUM_DIISI   target kosong
//   5. DI_BAWAH_TARGET      bersih setelah iklan < target
//   6. MASUK_TARGET         bersih setelah iklan >= target
export function statusOf(row: StatusInput, target: number | null): Status {
  if (row.adCost > 0 && row.netAfterAds != null && row.netAfterAds <= 0)
    return "RUGI";
  if (row.validOrders < MIN_ORDERS) return "SAMPEL_KECIL";
  if (
    row.netAfterAds == null ||
    row.coveragePct == null ||
    row.coveragePct < MIN_COVERAGE_PCT
  )
    return "DATA_BELUM_LENGKAP";
  if (target == null) return "TARGET_BELUM_DIISI";
  return row.netAfterAds >= target ? "MASUK_TARGET" : "DI_BAWAH_TARGET";
}

// ------------------------------------------------------------------ target

export type TargetKind = "kerja" | "bos";
export type TargetRow = {
  id: number;
  storeId: string | null;
  productId: string | null;
  kind: TargetKind;
  target: number;
  effectiveFrom: string;
  note: string | null;
  updatedBy: string;
  updatedAt: string | null;
};

// Target yang berlaku untuk satu periode (dinilai pada tanggal AWAL periode, jadi periode
// lama tetap dinilai dengan target yang berlaku saat itu). Yang lebih spesifik menang:
// toko+produk, lalu toko, lalu umum; di tiap tingkat, effective_from terbaru yang <= awal periode.
export function resolveTarget(
  rows: TargetRow[],
  q: {
    kind: TargetKind;
    storeId: string;
    productId?: string | null;
    periodStart: string;
  },
): TargetRow | null {
  const productId = q.productId ?? null;
  const rank = (t: TargetRow): number => {
    if (t.storeId === q.storeId && productId && t.productId === productId)
      return 4;
    if (t.storeId === q.storeId && t.productId === null) return 3;
    if (t.storeId === null && productId && t.productId === productId) return 2;
    if (t.storeId === null && t.productId === null) return 1;
    return 0;
  };
  const cands = rows.filter(
    (t) => t.kind === q.kind && t.effectiveFrom <= q.periodStart && rank(t) > 0,
  );
  cands.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      (a.effectiveFrom < b.effectiveFrom
        ? 1
        : a.effectiveFrom > b.effectiveFrom
          ? -1
          : b.id - a.id),
  );
  return cands[0] ?? null;
}

// ------------------------------------------------------------------ tipe hasil

export type StoreRef = { id: string; code: string; name: string };
export type PanelPeriod = {
  start: string;
  end: string;
  adCostTotal: number;
  adCostMapped: number;
  unmatchedOrders: number;
  hasAutoDetail: boolean;
  autoReportCost: number;
};
export type PanelRow = {
  productId: string;
  productName: string | null;
  validOrders: number;
  validUnits: number;
  cancelPct: number | null;
  releasedOrders: number;
  releasedUnits: number;
  coveragePct: number | null;
  avgIncome: number | null; // bersih per pcs sebelum iklan
  adCost: number;
  adCostPerUnit: number | null;
  netAfterAds: number | null; // bersih per pcs setelah iklan
  estTotal: number | null; // perkiraan total untung setelah iklan
  status: Status; // terhadap target kerja resmi
  gap: number | null; // netAfterAds - target kerja (negatif = kurang)
  bossStatus: Status | null; // terhadap target bos, kosong bila bos belum menetapkan
};
export type TargetHistoryItem = {
  target: number;
  effectiveFrom: string;
  note: string | null;
  updatedBy: string;
  updatedAt: string | null;
};
export type PanelData = {
  ok: true;
  empty: false;
  store: StoreRef;
  periods: PanelPeriod[];
  period: { start: string; end: string };
  rules: { minOrders: number; minCoveragePct: number };
  targets: {
    kerja: number | null;
    kerjaFrom: string | null;
    bos: number | null;
    history: TargetHistoryItem[];
  };
  summary: {
    products: number;
    validUnits: number;
    adCost: number;
    estTotal: number;
    coveragePct: number | null; // pcs yang dananya sudah dilepas / pcs valid
    statusCounts: Record<Status, number>;
  };
  rows: PanelRow[];
  warnings: string[];
};
export type PanelEmpty = { ok: true; empty: true; store: StoreRef };

export type HandlerResult = { status: number; json: Record<string, unknown> };
export type DbResult = { data: unknown; error: string | null };

export interface PanelDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  periodChecks(storeId: string): Promise<DbResult>; // view panel_period_check
  autoChecks(storeId: string): Promise<DbResult>; // view ads_auto_check
  productRows(storeId: string, start: string, end: string): Promise<DbResult>; // panel_product_period
  targets(storeId: string): Promise<DbResult>; // kerja dan bos: milik toko, plus yang umum
  findTarget(
    storeId: string,
    kind: TargetKind,
    effectiveFrom: string,
  ): Promise<{
    row: { id: number; target: number; note: string | null } | null;
    error: string | null;
  }>;
  insertTarget(row: {
    store_id: string;
    kind: TargetKind;
    target: number;
    effective_from: string;
    note: string | null;
    updated_by: string;
  }): Promise<{ error: string | null }>;
  updateTarget(
    id: number,
    patch: {
      target: number;
      note: string | null;
      updated_by: string;
      updated_at: string;
    },
  ): Promise<{ error: string | null }>;
  now(): number;
}

// ------------------------------------------------------------------ pembantu

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
const rp = (n: number): string => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const fail = (status: number, error: string): HandlerResult => ({
  status,
  json: { ok: false, error },
});

// Selisih pembulatan Shopee antara jumlah per produk dan total (Oktober HS1: Rp2).
const MAPPING_TOLERANCE = 5;

async function ownedStore(
  deps: PanelDeps,
  admin: string,
  storeId: unknown,
): Promise<{ store: StoreRow } | { error: HandlerResult }> {
  if (typeof storeId !== "string" || !UUID_RE.test(storeId))
    return { error: fail(400, "Pilih toko dulu.") };
  const store = await deps.getStore(storeId);
  if (!store || store.marketplace !== "shopee" || store.managed_by !== admin)
    return { error: fail(403, "Toko ini bukan toko Shopee milikmu.") };
  return { store };
}

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

// ------------------------------------------------------------------ baca panel

export type PanelQuery = {
  store?: string | null;
  start?: string | null;
  end?: string | null;
};

export async function handlePanel(
  deps: PanelDeps,
  admin: string | null,
  q: PanelQuery,
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  const owned = await ownedStore(deps, admin, q.store);
  if ("error" in owned) return owned.error;
  const store = owned.store;
  const ref: StoreRef = { id: store.id, code: store.code, name: store.name };

  // Periode = periode file iklan yang sudah diupload.
  const [chk, auto] = await Promise.all([
    deps.periodChecks(store.id),
    deps.autoChecks(store.id),
  ]);
  if (chk.error) return fail(500, `Gagal membaca periode iklan: ${chk.error}`);
  if (auto.error)
    return fail(500, `Gagal membaca rincian iklan: ${auto.error}`);
  const autoByKey = new Map<string, Rec>();
  for (const a of rowsOf(auto.data))
    autoByKey.set(`${dateOnly(a.period_start)}|${dateOnly(a.period_end)}`, a);

  const periods: PanelPeriod[] = rowsOf(chk.data)
    .map((c) => {
      const start = dateOnly(c.period_start) ?? "";
      const end = dateOnly(c.period_end) ?? "";
      const a = autoByKey.get(`${start}|${end}`);
      return {
        start,
        end,
        adCostTotal: num(c.ad_cost_total),
        adCostMapped: num(c.ad_cost_mapped),
        unmatchedOrders: num(c.unmatched_orders),
        hasAutoDetail: a ? a.has_detail === true : false,
        autoReportCost: a ? num(a.report_cost) : 0,
      };
    })
    .filter((p) => p.start && p.end)
    .sort((x, y) =>
      x.end === y.end ? (x.start < y.start ? 1 : -1) : x.end < y.end ? 1 : -1,
    ); // terbaru dulu

  if (periods.length === 0) {
    const empty: PanelEmpty = { ok: true, empty: true, store: ref };
    return { status: 200, json: empty };
  }

  let period = periods[0];
  if (q.start || q.end) {
    if (!q.start || !q.end || !isIsoDate(q.start) || !isIsoDate(q.end))
      return fail(400, "Periode tidak valid.");
    const found = periods.find((p) => p.start === q.start && p.end === q.end);
    if (!found)
      return fail(400, "Periode itu tidak ada di data iklan toko ini.");
    period = found;
  }

  const [rowsRes, tgtRes] = await Promise.all([
    deps.productRows(store.id, period.start, period.end),
    deps.targets(store.id),
  ]);
  if (rowsRes.error)
    return fail(500, `Gagal membaca data panel: ${rowsRes.error}`);
  if (tgtRes.error) return fail(500, `Gagal membaca target: ${tgtRes.error}`);

  const targetRows = rowsOf(tgtRes.data)
    .map(parseTarget)
    .filter((t): t is TargetRow => t !== null);
  const kerjaT = resolveTarget(targetRows, {
    kind: "kerja",
    storeId: store.id,
    periodStart: period.start,
  });
  const bosT = resolveTarget(targetRows, {
    kind: "bos",
    storeId: store.id,
    periodStart: period.start,
  });

  const rows: PanelRow[] = rowsOf(rowsRes.data).map((x) => {
    const base = {
      validOrders: num(x.valid_orders),
      coveragePct: numOrNull(x.coverage_pct),
      adCost: num(x.ad_cost),
      netAfterAds: numOrNull(x.net_after_ads),
    };
    const productId = str(x.product_id) ?? "-";
    // Target khusus produk (kalau ada) mengalahkan target toko.
    const k = resolveTarget(targetRows, {
      kind: "kerja",
      storeId: store.id,
      productId,
      periodStart: period.start,
    });
    const b = resolveTarget(targetRows, {
      kind: "bos",
      storeId: store.id,
      productId,
      periodStart: period.start,
    });
    const kt = k ? k.target : null;
    return {
      productId,
      productName: str(x.product_name),
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

  const warnings: string[] = [];
  const diff = period.adCostMapped - period.adCostTotal;
  if (Math.abs(diff) > MAPPING_TOLERANCE) {
    warnings.push(
      `Biaya iklan per produk (${rp(period.adCostMapped)}) tidak sama dengan total di file iklan (${rp(period.adCostTotal)}). ${
        diff < 0
          ? "Ada biaya iklan yang belum terhubung ke produk (periksa pemetaan Iklan Produk Otomatis), jadi biaya per produk lebih rendah dari kenyataan."
          : "Periksa apakah file iklan dan rinciannya dari periode yang sama."
      }`,
    );
  }
  if (period.autoReportCost > 0 && !period.hasAutoDetail) {
    warnings.push(
      "Rincian Iklan Produk Otomatis periode ini belum diupload. Biaya iklan otomatis masih dibebankan lewat pemetaan cadangan (satu produk), jadi biaya per produk belum akurat.",
    );
  }
  if (period.unmatchedOrders > 0) {
    warnings.push(
      `${period.unmatchedOrders.toLocaleString("id-ID")} pesanan tidak bisa dihubungkan ke produk (nama produk di file pesanan tidak ditemukan di data penghasilan atau iklan), jadi tidak ikut terhitung.`,
    );
  }
  if (coveragePct != null && coveragePct < MIN_COVERAGE_PCT) {
    warnings.push(
      `Dana baru cair untuk ${coveragePct}% pcs di periode ini. Bersih per pcs baru layak dinilai kalau dana sudah cair lebih dari ${MIN_COVERAGE_PCT}%.`,
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

  const data: PanelData = {
    ok: true,
    empty: false,
    store: ref,
    periods,
    period: { start: period.start, end: period.end },
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
    },
    rows,
    warnings,
  };
  return { status: 200, json: data };
}

// ------------------------------------------------------------------ simpan target kerja

export const MAX_TARGET = 2_000_000; // Rp per pcs; di atas ini pasti salah ketik

// Menyimpan target kerja toko (bukan target bos: itu sengaja tidak bisa diubah dari sini).
// Tanggal yang sudah punya target = ubah nilainya; tanggal baru = target baru yang berlaku
// sejak tanggal itu. Riwayat dicatat otomatis oleh trigger di database.
export async function handleSetTarget(
  deps: PanelDeps,
  admin: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return fail(400, "Permintaan tidak valid.");
  const b = body as Rec;

  const owned = await ownedStore(deps, admin, b.store);
  if ("error" in owned) return owned.error;
  const store = owned.store;

  if (b.kind !== "kerja")
    return fail(
      403,
      "Target bos tidak bisa diubah dari sini. Hanya target kerja toko.",
    );
  const target = b.target;
  if (
    typeof target !== "number" ||
    !Number.isFinite(target) ||
    target < 0 ||
    target > MAX_TARGET
  )
    return fail(
      400,
      `Target harus angka antara Rp0 dan ${rp(MAX_TARGET)} per pcs.`,
    );
  const rounded = Math.round(target);

  const eff = b.effectiveFrom;
  if (!isIsoDate(eff) || eff < "2025-01-01" || eff > "2035-12-31")
    return fail(400, "Tanggal mulai berlaku tidak valid.");

  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== "string") return fail(400, "Catatan tidak valid.");
    note = b.note.trim().slice(0, 200) || null;
  }

  const found = await deps.findTarget(store.id, "kerja", eff);
  if (found.error) return fail(500, `Gagal membaca target: ${found.error}`);

  if (found.row) {
    if (found.row.target === rounded && (found.row.note ?? null) === note)
      return {
        status: 200,
        json: {
          ok: true,
          unchanged: true,
          target: rounded,
          effectiveFrom: eff,
        },
      };
    const u = await deps.updateTarget(found.row.id, {
      target: rounded,
      note,
      updated_by: admin,
      updated_at: new Date(deps.now()).toISOString(),
    });
    if (u.error) return fail(500, `Gagal menyimpan target: ${u.error}`);
    return {
      status: 200,
      json: {
        ok: true,
        unchanged: false,
        previous: found.row.target,
        target: rounded,
        effectiveFrom: eff,
      },
    };
  }

  const ins = await deps.insertTarget({
    store_id: store.id,
    kind: "kerja",
    target: rounded,
    effective_from: eff,
    note,
    updated_by: admin,
  });
  if (ins.error) return fail(500, `Gagal menyimpan target: ${ins.error}`);
  return {
    status: 200,
    json: {
      ok: true,
      unchanged: false,
      previous: null,
      target: rounded,
      effectiveFrom: eff,
    },
  };
}

// Tanggal bawaan untuk "mulai berlaku": awal periode yang sedang dilihat. Dipakai halaman.
export const defaultEffectiveFrom = (
  periodStart: string | null | undefined,
): string => periodStart ?? todayWib();
