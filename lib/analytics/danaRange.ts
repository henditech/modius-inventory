// lib/analytics/danaRange.ts
// Pembantu tanggal untuk tab Penghasilan dan Saldo (fungsi murni, dipakai server dan browser).
// Semua tanggal berupa teks "YYYY-MM-DD" dalam kalender WIB.
import { fmtDate } from "./uploadView";

export type DateRange = { from: string; to: string };
export type Coverage = {
  incomeFirst: string | null;
  incomeLast: string | null;
  walletFirst: string | null;
  walletLast: string | null;
  ordersFirst: string | null;
  ordersLast: string | null;
};

const DAY = 86400000;
const parseIso = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = parseIso(v);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v; // menolak 2026-02-31
}

export const addDays = (iso: string, n: number): string =>
  new Date(parseIso(iso) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string): number =>
  Math.round((parseIso(b) - parseIso(a)) / DAY);
export const todayWib = (nowMs: number = Date.now()): string =>
  new Date(nowMs + 7 * 3600000).toISOString().slice(0, 10);

export function validateRange(
  from: string,
  to: string,
  maxDays = 400,
): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return "Tanggal tidak valid.";
  if (from > to) return "Tanggal awal harus sebelum tanggal akhir.";
  if (daysBetween(from, to) + 1 > maxDays)
    return `Rentang terlalu panjang (maksimal ${maxDays} hari).`;
  return null;
}

// Rentang bawaan: irisan data penghasilan dan saldo (itulah yang bisa dicocokkan).
// Kalau tidak beririsan atau hanya satu yang ada, pakai yang tersedia.
export function defaultRange(c: Coverage): DateRange | null {
  const {
    incomeFirst: iF,
    incomeLast: iL,
    walletFirst: wF,
    walletLast: wL,
  } = c;
  if (iF && iL && wF && wL) {
    const from = iF > wF ? iF : wF;
    const to = iL < wL ? iL : wL;
    if (from <= to) return { from, to };
    return { from: iF < wF ? iF : wF, to: iL > wL ? iL : wL };
  }
  if (iF && iL) return { from: iF, to: iL };
  if (wF && wL) return { from: wF, to: wL };
  if (c.ordersFirst && c.ordersLast)
    return { from: c.ordersFirst, to: c.ordersLast };
  return null;
}

export type Preset = "7d" | "30d" | "thisMonth" | "lastMonth" | "all";
export const PRESET_LABEL: Record<Preset, string> = {
  "7d": "7 hari terakhir",
  "30d": "30 hari terakhir",
  thisMonth: "Bulan ini",
  lastMonth: "Bulan lalu",
  all: "Semua data",
};

export function presetRange(
  p: Preset,
  today: string,
  c: Coverage,
): DateRange | null {
  switch (p) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "lastMonth": {
      const to = addDays(`${today.slice(0, 8)}01`, -1);
      return { from: `${to.slice(0, 8)}01`, to };
    }
    case "all": {
      const firsts = [c.incomeFirst, c.walletFirst]
        .filter((x): x is string => !!x)
        .sort();
      const lasts = [c.incomeLast, c.walletLast]
        .filter((x): x is string => !!x)
        .sort();
      return firsts.length && lasts.length
        ? { from: firsts[0], to: lasts[lasts.length - 1] }
        : null;
    }
  }
}

// Peringatan kalau rentang melewati data yang sudah diupload.
export function rangeWarnings(r: DateRange, c: Coverage): string[] {
  const out: string[] = [];
  const check = (label: string, first: string | null, last: string | null) => {
    if (!first || !last) {
      out.push(`Belum ada data ${label} untuk toko ini.`);
      return;
    }
    if (r.to > last)
      out.push(
        `Data ${label} baru sampai ${fmtDate(last)}. Angka sesudah tanggal itu belum lengkap.`,
      );
    if (r.from < first)
      out.push(
        `Data ${label} mulai ${fmtDate(first)}. Angka sebelum tanggal itu belum lengkap.`,
      );
  };
  check("penghasilan", c.incomeFirst, c.incomeLast);
  check("saldo", c.walletFirst, c.walletLast);
  return out;
}

// "2026-10-05" (Senin) -> "5–11 Okt"; lintas bulan -> "28 Sep – 4 Okt"
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const [sy, sm, sd] = weekStart.split("-");
  const [, em, ed] = end.split("-");
  const mon = (m: string) => fmtDate(`2000-${m}-01`).split(" ")[1];
  return sm === em
    ? `${Number(sd)}–${Number(ed)} ${mon(sm)}`
    : `${Number(sd)} ${mon(sm)} – ${Number(ed)} ${mon(em)}`;
}
