// lib/analytics/iklanView.ts
// Pembantu tampilan untuk tab Iklan (fungsi murni, mudah diuji).
import type { AdFlag, ProductAds } from "./iklan";

// ------------------------------------------------------------------ sorotan (flag)
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

// ------------------------------------------------------------------ vonis keputusan
export type AdVerdict = "AMAN" | "PANTAU" | "HENTIKAN" | "DATA_KURANG";

// Ambang ada di satu tempat supaya gampang diubah sambil belajar.
export const VERDICT_RULES = {
  minCost: 100_000, // di bawah ini terlalu sedikit untuk dinilai
  watchSharePct: 25, // iklan memakan >= 25% bersih per pcs: pantau (sama dengan HIGH_AD_SHARE_PCT di iklan.ts)
  stopSharePct: 60, // iklan memakan >= 60% bersih per pcs: hentikan
  claimRatio: 1.3, // klaim iklan > 1,3x pcs nyata: atribusi mencurigakan
};

export const VERDICT_LABEL: Record<AdVerdict, string> = {
  AMAN: "Aman",
  PANTAU: "Pantau",
  HENTIKAN: "Pertimbangkan hentikan",
  DATA_KURANG: "Data kurang",
};
export const VERDICT_TONE: Record<AdVerdict, string> = {
  AMAN: "bg-emerald-500/15 text-emerald-300",
  PANTAU: "bg-amber-500/15 text-amber-300",
  HENTIKAN: "bg-red-500/15 text-red-300",
  DATA_KURANG: "bg-white/5 text-neutral-400",
};
export const VERDICT_ORDER: AdVerdict[] = ["HENTIKAN", "PANTAU", "AMAN"];

export function adVerdict(p: ProductAds): {
  verdict: AdVerdict;
  reason: string;
} {
  const R = VERDICT_RULES;
  const share = p.adShareOfIncomePct; // 100 = iklan menghabiskan seluruh bersih
  const net = p.netAfterAds;

  if (p.totalCost < R.minCost)
    return {
      verdict: "DATA_KURANG",
      reason: "Biaya iklan masih kecil, belum adil dinilai",
    };

  if (share == null && net == null)
    return {
      verdict: "DATA_KURANG",
      reason: "Data pesanan dan penghasilan produk ini belum ada",
    };

  if (net != null && net <= 0)
    return {
      verdict: "HENTIKAN",
      reason: "Bersih per pcs setelah iklan sudah nol atau rugi",
    };

  if (share != null && share >= R.stopSharePct)
    return {
      verdict: "HENTIKAN",
      reason: `Iklan memakan ${share.toFixed(0)}% dari bersih per pcs`,
    };

  if (share != null && share >= R.watchSharePct)
    return {
      verdict: "PANTAU",
      reason: `Iklan memakan ${share.toFixed(0)}% dari bersih per pcs`,
    };

  if (
    p.realUnits != null &&
    p.realUnits > 0 &&
    p.claimedUnits > p.realUnits * R.claimRatio
  )
    return {
      verdict: "PANTAU",
      reason: `Klaim iklan ${p.claimedUnits} pcs, pcs nyata hanya ${p.realUnits}`,
    };

  return { verdict: "AMAN", reason: "Iklan masih jauh dari batas impas" };
}

export function verdictCounts(rows: ProductAds[]): Record<AdVerdict, number> {
  const out: Record<AdVerdict, number> = {
    AMAN: 0,
    PANTAU: 0,
    HENTIKAN: 0,
    DATA_KURANG: 0,
  };
  for (const p of rows) out[adVerdict(p).verdict]++;
  return out;
}

// ------------------------------------------------------------------ filter dan urutan

// "OVERLAP" = produk yang biayanya jalan di dua jalur sekaligus.
export type IklanFilter = AdFlag | AdVerdict | "OVERLAP" | "ALL";
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

const isVerdict = (f: IklanFilter): f is AdVerdict => f in VERDICT_LABEL;

const matchFilter = (p: ProductAds, f: IklanFilter): boolean => {
  if (f === "ALL") return true;
  if (f === "OVERLAP") return isOverlap(p);
  if (isVerdict(f)) return adVerdict(p).verdict === f;
  return p.flags.includes(f);
};

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
      matchFilter(p, f.filter) &&
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
