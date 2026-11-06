// lib/analytics/pesananView.ts
// Pembantu tampilan untuk tab Pesanan (fungsi murni, mudah diuji).
import {
  PRESET_LABEL,
  addDays,
  type DateRange,
  type Preset,
} from "./danaRange";
import { fmtDate } from "./uploadView";

export { PRESET_LABEL };
export type { Preset };

export type OrdersCoverage = {
  ordersFirst: string | null;
  ordersLast: string | null;
};

// Rentang cepat untuk data pesanan. "Semua data" = seluruh cakupan pesanan yang tersimpan.
export function presetRange(
  p: Preset,
  today: string,
  c: OrdersCoverage,
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
    case "all":
      return c.ordersFirst && c.ordersLast
        ? { from: c.ordersFirst, to: c.ordersLast }
        : null;
  }
}

// "2026-10-05" -> "5 Okt" (untuk sumbu grafik)
export function dayLabel(iso: string): string {
  const [, , d] = iso.split("-");
  return `${Number(d)} ${fmtDate(iso).split(" ")[1]}`;
}

// 0 -> "00.00"
export const hourLabel = (h: number): string =>
  `${String(h).padStart(2, "0")}.00`;

// Tinggi batang per jam relatif terhadap jam tersibuk (0 sampai 100), untuk grafik jam.
export function hourBars(
  hours: { hour: number; orders: number }[],
): { hour: number; orders: number; heightPct: number }[] {
  const max = hours.reduce((a, h) => Math.max(a, h.orders), 0);
  return hours.map((h) => ({
    hour: h.hour,
    orders: h.orders,
    heightPct: max > 0 ? Math.round((100 * h.orders) / max) : 0,
  }));
}

// Warna status pesanan di tabel.
export const STATUS_TONE = (status: string): string => {
  if (status === "Batal") return "bg-red-500/15 text-red-300";
  if (status === "Selesai") return "bg-emerald-500/15 text-emerald-300";
  if (status === "Belum Bayar") return "bg-amber-500/15 text-amber-300";
  return "bg-white/5 text-neutral-300"; // sedang dikirim, telah dikirim, dst.
};
