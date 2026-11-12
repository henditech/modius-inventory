// lib/analytics/ttIklanView.ts
// Fungsi murni untuk tampilan tab Iklan TikTok: pilihan rentang cepat dan kalimat temuan.
import type { TtIklanData } from "./ttIklan";
import { fmtDate, rp } from "./uploadView";

export type Preset = "7" | "30" | "month" | "lastmonth" | "all";

export const PRESET_LABEL: Record<Preset, string> = {
  "7": "7 hari data terakhir",
  "30": "30 hari data terakhir",
  month: "Bulan ini",
  lastmonth: "Bulan lalu",
  all: "Semua data",
};

type Range = { from: string; to: string };

const DAY = 86400000;
const addDays = (iso: string, n: number): string =>
  new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

// "7/30 hari data terakhir" dihitung mundur dari hari terakhir yang ADA datanya (bukan dari
// hari ini), supaya tidak kosong kalau upload terakhir sudah beberapa hari lalu.
export function presetRange(
  p: Preset,
  cov: { adsFirst: string | null; adsLast: string | null },
  today: string,
): Range | null {
  const { adsFirst: first, adsLast: last } = cov;
  if (!first || !last) return null;
  if (p === "7" || p === "30") {
    const back = p === "7" ? 6 : 29;
    const start = addDays(last, -back);
    return { from: start < first ? first : start, to: last };
  }
  if (p === "month") {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (p === "lastmonth") {
    const end = addDays(`${today.slice(0, 7)}-01`, -1);
    return { from: `${end.slice(0, 7)}-01`, to: end };
  }
  return { from: first, to: last };
}

export const roiTxt = (n: number | null): string =>
  n == null ? "–" : n.toFixed(2).replace(".", ",");

export function insightLines(d: TtIklanData): string[] {
  const s = d.summary;
  if (s.days === 0) return ["Belum ada data iklan di rentang ini."];
  if (s.cost === 0) {
    return [`Tidak ada biaya iklan di rentang ini (${s.days} hari data).`];
  }

  const lines: string[] = [
    `Biaya iklan ${rp(s.cost)} selama ${s.activeDays} hari aktif dari ${s.days} hari data. Iklan mengklaim ${s.skuOrders} pesanan SKU dengan penghasilan bruto ${rp(s.grossRevenue)} (ROI ${roiTxt(s.roi)}).`,
  ];
  if (s.costPerOrder != null) {
    lines.push(`Biaya per pesanan ${rp(s.costPerOrder)}.`);
  }

  const idle = d.daily.filter((x) => x.cost > 0 && x.skuOrders === 0);
  if (idle.length > 0) {
    const idleCost = idle.reduce((a, x) => a + x.cost, 0);
    lines.push(
      `${idle.length} hari ada biaya iklan tapi tanpa pesanan yang diklaim iklan, total ${rp(idleCost)}.`,
    );
  }

  const active = d.daily.filter(
    (x) => x.cost > 0 && x.skuOrders > 0 && x.roi != null,
  );
  if (active.length >= 2) {
    const sorted = [...active].sort(
      (a, b) => (a.roi as number) - (b.roi as number),
    );
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    lines.push(
      `ROI harian tertinggi ${fmtDate(high.day)} (${roiTxt(high.roi)}), terendah ${fmtDate(low.day)} (${roiTxt(low.roi)}).`,
    );
  }

  lines.push(
    "Angka ini klaim iklan, jadi batas atas: belum dipotong pengembalian dana dan biaya platform.",
  );
  return lines;
}
