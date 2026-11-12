// lib/analytics/ttPenghasilanView.ts
// Pembantu tampilan untuk tab Penghasilan TikTok (fungsi murni, mudah diuji).
import { addDays } from "./ttPenghasilan";
import type { DayRow, TtPenghasilanData } from "./ttPenghasilan";
import { fmtPct, rp } from "./uploadView";

export type Preset = "7" | "30" | "month" | "lastmonth" | "all";

export const PRESET_LABEL: Record<Preset, string> = {
  "7": "7 hari terakhir",
  "30": "30 hari terakhir",
  month: "Bulan ini",
  lastmonth: "Bulan lalu",
  all: "Semua data",
};

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOfMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12

// todayIso = tanggal hari ini di WIB. "Semua data" = dari data pertama sampai terakhir yang tersimpan.
export function presetRange(
  p: Preset,
  cov: { incomeFirst: string | null; incomeLast: string | null },
  todayIso: string,
): { from: string; to: string } | null {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  switch (p) {
    case "7":
      return { from: addDays(todayIso, -6), to: todayIso };
    case "30":
      return { from: addDays(todayIso, -29), to: todayIso };
    case "month":
      return { from: `${y}-${pad(m)}-01`, to: todayIso };
    case "lastmonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return {
        from: `${py}-${pad(pm)}-01`,
        to: `${py}-${pad(pm)}-${pad(lastDayOfMonth(py, pm))}`,
      };
    }
    case "all":
      return cov.incomeFirst && cov.incomeLast
        ? { from: cov.incomeFirst, to: cov.incomeLast }
        : null;
  }
}

const pct = (n: number | null): string => (n == null ? "–" : fmtPct(n));

// Persen bertanda untuk tabel: biaya ditulis dengan minus yang jelas, sama seperti kolom jumlah.
export const pctSigned = (n: number | null): string =>
  n == null ? "–" : n < 0 ? `−${fmtPct(-n)}` : fmtPct(n);

// Kalimat ringkasan "yang terlihat di data". Hanya angka yang memang ada; tidak ada saran.
export function insightLines(d: TtPenghasilanData): string[] {
  const s = d.summary;
  const out: string[] = [];
  if (s.entries === 0) return ["Tidak ada dana yang dilepas pada rentang ini."];

  out.push(
    `Penjualan ${rp(s.subtotalAfter)} setelah diskon penjual; ${rp(-s.refundAfter)} (${pct(d.rates.refundPct)}) dikembalikan ke pembeli, jadi pendapatan ${rp(s.revenue)}.`,
  );
  if (s.orders > 0)
    out.push(
      `${s.ordersRefundedFully} dari ${s.orders} pesanan dikembalikan penuh (pendapatan dan dana Rp0).`,
    );
  if (s.sellerDiscount !== 0)
    out.push(
      `Diskon penjual ${rp(-s.sellerDiscount)}, ${pct(d.rates.sellerDiscountPct)} dari harga sebelum diskon.`,
    );

  const topFees = [...d.breakdown]
    .filter((b) => b.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 3)
    .map(
      (b) =>
        `${b.label} ${pct(b.pctOfRevenue == null ? null : Math.abs(b.pctOfRevenue))}`,
    );
  out.push(
    `Potongan platform ${rp(-s.totalFee)} (${pct(d.rates.feePct)} dari pendapatan)${topFees.length ? `. Terbesar: ${topFees.join(", ")}` : ""}.`,
  );
  if (s.adsCost !== 0)
    out.push(
      `Iklan ${rp(-s.adsCost)} (${pct(d.rates.adsPct)} dari pendapatan), dipotong lewat GMV Pay.`,
    );

  let net = `Dana bersih ${rp(s.settlement)}: ${pct(d.rates.netPct)} dari pendapatan`;
  if (d.perOrder.afterAds != null)
    net += `, ${rp(d.perOrder.afterAds)} per pesanan berdana`;
  if (d.perOrder.afterAdsPerPcs != null)
    net += ` (perkiraan ${rp(d.perOrder.afterAdsPerPcs)} per pcs)`;
  out.push(net + ".");

  if (d.pending.orders > 0)
    out.push(
      `${d.pending.orders} pesanan belum masuk penghasilan (nilai ${rp(d.pending.subtotal)}); dananya belum cair atau belum diupload.`,
    );
  return out;
}

// Tinggi batang grafik dalam PIKSEL (bukan persen: persen tidak ter-render di batang grafik).
// Batang naik untuk dana positif, turun untuk dana negatif (hari yang hanya kena potongan iklan).
export function barHeights(
  days: DayRow[],
  upPx = 100,
  downPx = 36,
): { up: number; down: number }[] {
  const maxUp = Math.max(0, ...days.map((d) => d.settlement));
  const maxDown = Math.max(0, ...days.map((d) => -d.settlement));
  const scale = maxUp > 0 ? upPx / maxUp : 0;
  const downScale =
    maxDown > 0 ? Math.min(scale || downPx / maxDown, downPx / maxDown) : 0;
  return days.map((d) => ({
    up: d.settlement > 0 ? Math.max(2, Math.round(d.settlement * scale)) : 0,
    down:
      d.settlement < 0 ? Math.max(2, Math.round(-d.settlement * downScale)) : 0,
  }));
}
