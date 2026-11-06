// lib/analytics/iklanView.ts
// Pembantu tampilan untuk tab Iklan (fungsi murni, mudah diuji).
import type { AdFlag, ProductAds } from "./iklan";

export const FLAG_LABEL: Record<AdFlag, string> = {
  TANPA_HASIL_OTOMATIS: "Otomatis tanpa hasil",
  TANPA_HASIL_INDIVIDUAL: "Individual tanpa hasil",
  ACOS_TINGGI: "ACOS tinggi",
  IKLAN_MAHAL: "Iklan mahal per pcs",
};
export const FLAG_TONE: Record<AdFlag, string> = {
  TANPA_HASIL_OTOMATIS: "bg-white/5 text-neutral-400",
  TANPA_HASIL_INDIVIDUAL: "bg-white/5 text-neutral-400",
  ACOS_TINGGI: "bg-red-500/15 text-red-300",
  IKLAN_MAHAL: "bg-amber-500/15 text-amber-300",
};
export const FLAG_ORDER: AdFlag[] = [
  "IKLAN_MAHAL",
  "ACOS_TINGGI",
  "TANPA_HASIL_INDIVIDUAL",
  "TANPA_HASIL_OTOMATIS",
];

// "OVERLAP" = produk yang biayanya jalan di dua jalur sekaligus.
export type IklanFilter = AdFlag | "OVERLAP" | "ALL";
export type IklanSortKey =
  | "totalCost"
  | "indCost"
  | "autoCost"
  | "autoSharePct"
  | "claimedUnits"
  | "realUnits"
  | "adShareOfIncomePct"
  | "netAfterAds";
export type SortDir = "asc" | "desc";

export const isOverlap = (p: ProductAds): boolean =>
  p.ind.cost > 0 && p.auto.cost > 0;

const sortValue = (p: ProductAds, k: IklanSortKey): number | null => {
  switch (k) {
    case "indCost":
      return p.ind.cost;
    case "autoCost":
      return p.auto.cost;
    default:
      return p[k];
  }
};

export function filterSortProducts(
  rows: ProductAds[],
  f: { filter: IklanFilter; query: string; key: IklanSortKey; dir: SortDir },
): ProductAds[] {
  const q = f.query.trim().toLowerCase();
  const out = rows.filter(
    (p) =>
      (f.filter === "ALL" ||
        (f.filter === "OVERLAP" ? isOverlap(p) : p.flags.includes(f.filter))) &&
      (q === "" ||
        p.productId.toLowerCase().includes(q) ||
        (p.productName ?? "").toLowerCase().includes(q)),
  );
  const sign = f.dir === "asc" ? 1 : -1;
  return out.sort((a, b) => {
    const x = sortValue(a, f.key);
    const y = sortValue(b, f.key);
    if (x == null && y == null) return a.productId.localeCompare(b.productId);
    if (x == null) return 1; // kosong selalu di bawah
    if (y == null) return -1;
    return (x - y) * sign || a.productId.localeCompare(b.productId);
  });
}

export function filterCounts(
  rows: ProductAds[],
): Record<AdFlag | "OVERLAP", number> {
  const out: Record<AdFlag | "OVERLAP", number> = {
    TANPA_HASIL_OTOMATIS: 0,
    TANPA_HASIL_INDIVIDUAL: 0,
    ACOS_TINGGI: 0,
    IKLAN_MAHAL: 0,
    OVERLAP: 0,
  };
  for (const p of rows) {
    for (const f of p.flags) out[f]++;
    if (isOverlap(p)) out.OVERLAP++;
  }
  return out;
}

// Status iklan dari Shopee diterjemahkan singkat untuk tabel.
export const AD_STATUS_TONE = (status: string | null): string =>
  status === "Berjalan"
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-white/5 text-neutral-400";
