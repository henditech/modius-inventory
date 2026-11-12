// lib/analytics/ttPesananView.ts
// Fungsi murni untuk tampilan tab Pesanan TikTok: rentang cepat dan kalimat temuan.
// Memakai kembali pilihan rentang dari ttIklanView.ts (logikanya sama, hanya nama kolom
// cakupan datanya yang beda).
import type { TtPesananData } from "./ttPesanan";
import {
  PRESET_LABEL,
  presetRange as rangeFor,
  type Preset,
} from "./ttIklanView";
import { TT_CHANNEL_UNKNOWN, TT_CREATOR_UNKNOWN } from "./ttPesanan";
import { rp } from "./uploadView";

export { PRESET_LABEL };
export type { Preset };

export function presetRange(
  p: Preset,
  cov: { ordersFirst: string | null; ordersLast: string | null },
  today: string,
): { from: string; to: string } | null {
  return rangeFor(
    p,
    { adsFirst: cov.ordersFirst, adsLast: cov.ordersLast },
    today,
  );
}

export const pctTxt = (n: number | null): string =>
  n == null ? "–" : `${n.toFixed(1).replace(".", ",")}%`;

export function insightLines(d: TtPesananData): string[] {
  const s = d.summary;
  const r = d.rates;
  if (s.orders === 0) return ["Belum ada pesanan di rentang ini."];

  const lines: string[] = [];
  lines.push(
    `${s.orders} pesanan (${s.pcs} pcs, nilai ${rp(s.orderValue)}): ${s.completed} selesai, ${s.shipping} masih dalam pengiriman, ${s.cancelled} dibatalkan${
      s.returned > 0 ? `, ${s.returned} ada return/refund` : ""
    }.`,
  );

  if (s.cancelled > 0) {
    lines.push(
      `${s.cancelled} pesanan dibatalkan (${pctTxt(r.cancelPct)}). Nilai penjualan yang tidak jadi masuk ${rp(s.cancelledValue)}.`,
    );
  }

  if (s.codOrders > 0) {
    let cod = `Bayar di tempat (COD) ${s.codOrders} dari ${s.orders} pesanan (${pctTxt(r.codPct)}).`;
    if (s.nonCodOrders > 0) {
      cod += ` Tingkat batal COD ${pctTxt(r.codCancelPct)}, non-COD ${pctTxt(r.nonCodCancelPct)}.`;
    }
    lines.push(cod);
  }

  const top = d.reasons[0];
  if (top) {
    lines.push(
      `Alasan batal terbanyak: ${top.reason} (${top.orders} pesanan, ${top.codOrders} di antaranya COD).`,
    );
  }

  const known = d.channels.filter((c) => c.channel !== TT_CHANNEL_UNKNOWN);
  if (known.length >= 2) {
    lines.push(
      `Per sumber: ${known
        .map(
          (c) =>
            `${c.channel} ${c.orders} pesanan (batal ${pctTxt(c.cancelPct)})`,
        )
        .join("; ")}.`,
    );
  }

  const named = d.creators.filter((c) => c.creator !== TT_CREATOR_UNKNOWN);
  const topCreator = named[0];
  if (topCreator) {
    lines.push(
      `Kreator dengan pesanan terbanyak: ${topCreator.creator}, ${topCreator.orders} pesanan, ${topCreator.cancelled} batal (${pctTxt(topCreator.cancelPct)}), komisi ${rp(Math.abs(topCreator.commission))} dari ${topCreator.settledOrders} pesanan yang sudah cair.`,
    );
  }
  const unnamed = d.creators.find((c) => c.creator === TT_CREATOR_UNKNOWN);
  if (unnamed && unnamed.commission !== 0) {
    lines.push(
      `Pesanan yang kreatornya tidak tercatat tetap kena komisi affiliate ${rp(Math.abs(unnamed.commission))}, jadi total komisi tidak bisa dibaca dari daftar kreator saja.`,
    );
  }

  const totalSales = d.products.reduce((a, p) => a + p.sales, 0);
  const best = d.products[0];
  if (best && totalSales > 0) {
    const share = Math.round((best.sales / totalSales) * 1000) / 10;
    lines.push(
      `Produk terbesar: ${best.sku} (${pctTxt(share)} dari penjualan yang tidak dibatalkan).`,
    );
  }

  return lines;
}
