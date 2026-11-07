// lib/analytics/hargaView.ts
// Pembantu tampilan untuk tab Harga (fungsi murni, mudah diuji).
import type { Band, ProductPrice } from "./harga";
import { dayLabel } from "./pesananView";

const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");

// Harga di pita: satu angka kalau semua pesanan sama harganya, atau rentang.
export function priceLabel(b: Pick<Band, "priceMin" | "priceMax">): string {
  return b.priceMin === b.priceMax
    ? `Rp${nf(b.priceMin)}`
    : `Rp${nf(b.priceMin)}–${nf(b.priceMax)}`;
}

// "1 Okt – 11 Okt", atau "28 Okt" kalau hanya satu hari.
export function periodLabelShort(firstDay: string, lastDay: string): string {
  return firstDay === lastDay
    ? dayLabel(firstDay)
    : `${dayLabel(firstDay)} – ${dayLabel(lastDay)}`;
}

export type HargaFilter = "VARIASI" | "SATU" | "SARAN" | "ALL";

export function filterProducts(
  rows: ProductPrice[],
  f: { filter: HargaFilter; query: string },
): ProductPrice[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(
    (p) =>
      (f.filter === "ALL" ||
        (f.filter === "VARIASI" && p.multiBand) ||
        (f.filter === "SATU" && !p.multiBand) ||
        (f.filter === "SARAN" && p.hint != null)) &&
      (q === "" ||
        p.productId.toLowerCase().includes(q) ||
        (p.productName ?? "").toLowerCase().includes(q)),
  );
}

export function filterCounts(
  rows: ProductPrice[],
): Record<HargaFilter, number> {
  return {
    ALL: rows.length,
    VARIASI: rows.filter((p) => p.multiBand).length,
    SATU: rows.filter((p) => !p.multiBand).length,
    SARAN: rows.filter((p) => p.hint != null).length,
  };
}

// Kalimat petunjuk untuk satu produk. Selalu menyebut bahwa ini perbandingan antar periode.
export function hintText(p: ProductPrice): string | null {
  if (!p.hint) return null;
  const best = p.bands.find((b) => b.priceBand === p.hint!.bestBand);
  const cur = p.bands.find((b) => b.priceBand === p.hint!.currentBand);
  if (!best || !cur) return null;
  return `Di ${priceLabel(best)} bersih per hari ±Rp${nf(best.estNetPerDay ?? 0)}, ${p.hint.gainPct.toLocaleString("id-ID", { maximumFractionDigits: 0 })}% lebih tinggi dari harga sekarang (${priceLabel(cur)}: ±Rp${nf(cur.estNetPerDay ?? 0)}). Ini perbandingan antar periode, bukan percobaan terkontrol.`;
}
