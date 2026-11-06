// lib/analytics/panelView.ts
// Pembantu tampilan untuk tab Panel (fungsi murni, mudah diuji). Aturan status tetap hanya
// satu: statusOf di panel.ts. Di sini status hanya DIPANGGIL ulang untuk mode simulasi.
import { daysBetween } from "./danaRange";
import { statusOf, STATUS_ORDER, type PanelRow, type Status } from "./panel";

export type SortKey =
  | "validUnits"
  | "validOrders"
  | "coveragePct"
  | "adCost"
  | "netAfterAds"
  | "gap"
  | "estTotal";
export type SortDir = "asc" | "desc";

export type ViewRow = PanelRow & {
  shownStatus: Status; // status yang tampil: resmi dari server, atau hasil simulasi
  shownGap: number | null; // selisih ke target yang tampil
};

export const STATUS_TONE: Record<Status, string> = {
  MASUK_TARGET: "bg-emerald-500/15 text-emerald-300",
  DI_BAWAH_TARGET: "bg-amber-500/15 text-amber-300",
  RUGI: "bg-red-500/15 text-red-300",
  SAMPEL_KECIL: "bg-white/5 text-neutral-400",
  DATA_BELUM_LENGKAP: "bg-sky-500/10 text-sky-300",
  TARGET_BELUM_DIISI: "bg-white/5 text-neutral-400",
};

// Teks target yang diketik: "70000", "70.000", "Rp 70.000", "70rb", "70k". Kosong/ngawur = null.
export function parseTargetInput(text: string): number | null {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/^rp\.?\s*/, "")
    .replace(/\s+/g, "");
  if (s === "") return null;
  const m = s.match(/^(\d+(?:[.,]\d+)*)(rb|k|ribu)?$/);
  if (!m) return null;
  let n: number;
  if (m[2]) {
    n = Number(m[1].replace(",", ".")) * 1000; // "70,5rb" = 70.500
  } else {
    n = Number(m[1].replace(/[.,]/g, "")); // titik/koma = pemisah ribuan
  }
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// simTarget null = pakai status resmi dari server (termasuk target khusus produk).
// simTarget ada = semua produk dinilai ulang dengan target itu, tanpa menyimpan apa pun.
export function applyTarget(
  rows: PanelRow[],
  simTarget: number | null,
): ViewRow[] {
  return rows.map((r) => {
    if (simTarget == null)
      return { ...r, shownStatus: r.status, shownGap: r.gap };
    return {
      ...r,
      shownStatus: statusOf(r, simTarget),
      shownGap: r.netAfterAds != null ? r.netAfterAds - simTarget : null,
    };
  });
}

export function countByStatus(rows: ViewRow[]): Record<Status, number> {
  const out = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<
    Status,
    number
  >;
  for (const r of rows) out[r.shownStatus]++;
  return out;
}

const sortValue = (r: ViewRow, key: SortKey): number | null =>
  key === "gap" ? r.shownGap : (r[key] as number | null);

export function filterAndSort(
  rows: ViewRow[],
  f: { status: Status | "ALL"; query: string; key: SortKey; dir: SortDir },
): ViewRow[] {
  const q = f.query.trim().toLowerCase();
  const out = rows.filter(
    (r) =>
      (f.status === "ALL" || r.shownStatus === f.status) &&
      (q === "" ||
        r.productId.toLowerCase().includes(q) ||
        (r.productName ?? "").toLowerCase().includes(q)),
  );
  const sign = f.dir === "asc" ? 1 : -1;
  return out.sort((a, b) => {
    const x = sortValue(a, f.key);
    const y = sortValue(b, f.key);
    if (x == null && y == null) return a.productId.localeCompare(b.productId);
    if (x == null) return 1; // kosong selalu di bawah, apa pun arahnya
    if (y == null) return -1;
    return (x - y) * sign || a.productId.localeCompare(b.productId);
  });
}

export const daysInPeriod = (start: string, end: string): number =>
  Math.max(1, daysBetween(start, end) + 1);

// Tabel geser target: untuk tiap target, berapa produk yang masuk, berapa pcs per hari
// dan perkiraan bersih per hari dari produk-produk itu. Hanya produk yang cukup datanya
// (statusOf sampai tahap perbandingan target) yang dihitung.
export const THRESHOLDS = [
  45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000,
];
export type ThresholdRow = {
  target: number;
  products: number;
  unitsPerDay: number;
  netPerDay: number;
};

export function thresholdTable(
  rows: PanelRow[],
  days: number,
  targets: number[] = THRESHOLDS,
): ThresholdRow[] {
  const d = Math.max(1, days);
  return targets.map((target) => {
    const inn = rows.filter((r) => statusOf(r, target) === "MASUK_TARGET");
    return {
      target,
      products: inn.length,
      unitsPerDay: inn.reduce((a, r) => a + r.validUnits, 0) / d,
      netPerDay: inn.reduce((a, r) => a + (r.estTotal ?? 0), 0) / d,
    };
  });
}
