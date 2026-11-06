// lib/analytics/iklan.ts
// Tab Iklan: iklan individual vs Iklan Produk Otomatis, per periode iklan dan per produk.
// Tanpa Next dan tanpa Supabase langsung, supaya bisa diuji (pola sama dengan panel.ts).
//
// Catatan membaca angka: omzet dan pcs di sini adalah KLAIM iklan versi Shopee (penjualan
// yang dikaitkan ke iklan). Itu batas atas, bukan bukti bahwa iklan menambah penjualan, dan
// bisa termasuk pesanan yang kemudian batal. Biaya iklannya sendiri nyata.
import { isIsoDate } from "./danaRange";
import type { StoreRow } from "./uploadHandler";

// ------------------------------------------------------------------ ambang sorotan
// Ambang ini sorotan untuk dilihat lebih dekat, bukan vonis. Mudah diubah di sini.
export const HIGH_ACOS_PCT = 30; // ACOS satu jalur untuk satu produk dianggap tinggi mulai angka ini ...
export const HIGH_ACOS_MIN_COST = 100_000; // ... kalau biayanya minimal segini (biaya kecil terlalu berisik)
export const HIGH_AD_SHARE_PCT = 25; // iklan memakan >= 25% penghasilan per pcs ...
export const HIGH_AD_SHARE_MIN_ORDERS = 10; // ... untuk produk dengan >= 10 pesanan valid

export type ChannelId = "individual" | "otomatis";
export type AdFlag =
  | "TANPA_HASIL_OTOMATIS"
  | "TANPA_HASIL_INDIVIDUAL"
  | "ACOS_TINGGI"
  | "IKLAN_MAHAL";

export type ChannelStat = {
  channel: ChannelId;
  nAds: number;
  impressions: number;
  clicks: number;
  unitsSold: number; // klaim iklan
  gmv: number; // omzet klaim iklan
  cost: number;
  roas: number | null; // omzet / biaya
  acosPct: number | null; // biaya / omzet
  costPerUnit: number | null;
  costPerClick: number | null;
  ctrPct: number | null; // klik / dilihat
  clickToUnitPct: number | null; // pcs klaim / klik
};

export type ChannelNums = {
  cost: number;
  clicks: number;
  units: number;
  gmv: number;
  acosPct: number | null;
  costPerUnit: number | null;
};

export type ProductAds = {
  productId: string;
  productName: string | null;
  ind: ChannelNums;
  auto: ChannelNums;
  totalCost: number;
  autoSharePct: number | null; // porsi biaya otomatis dari total biaya iklan produk ini
  claimedUnits: number; // pcs klaim kedua jalur
  realUnits: number | null; // pcs valid dari pesanan (panel), kosong kalau tidak ada
  claimPct: number | null; // klaim iklan / pcs valid
  validOrders: number | null;
  avgIncome: number | null; // bersih per pcs sebelum iklan
  adCostPerUnit: number | null; // seluruh biaya iklan / pcs valid
  netAfterAds: number | null;
  adShareOfIncomePct: number | null; // iklan per pcs / bersih sebelum iklan
  flags: AdFlag[];
};

export type AdRow = {
  adName: string;
  productCode: string;
  status: string | null;
  biddingMode: string | null;
  startedOn: string | null;
  impressions: number;
  clicks: number;
  unitsSold: number;
  gmv: number;
  cost: number;
  roas: number | null;
  acosPct: number | null;
};

export type IklanPeriod = {
  start: string;
  end: string;
  hasAutoDetail: boolean;
  autoCost: number;
};

export type StoreRef = { id: string; code: string; name: string };

export type IklanData = {
  ok: true;
  empty: false;
  store: StoreRef;
  periods: IklanPeriod[];
  period: { start: string; end: string };
  channels: ChannelStat[]; // selalu dua baris: individual dan otomatis
  total: Omit<ChannelStat, "channel">; // gabungan dua jalur
  leak: { products: number; cost: number; sharePct: number | null };
  claim: { claimedUnits: number; realUnits: number; pct: number | null };
  reading: string[];
  thresholds: {
    highAcosPct: number;
    highAcosMinCost: number;
    highAdSharePct: number;
    highAdShareMinOrders: number;
  };
  products: ProductAds[];
  ads: AdRow[];
  warnings: string[];
};
export type IklanEmpty = { ok: true; empty: true; store: StoreRef };

export type HandlerResult = { status: number; json: Record<string, unknown> };
export type DbResult = { data: unknown; error: string | null };

export interface IklanDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  channelRows(storeId: string): Promise<DbResult>; // view ads_channel_summary, semua periode
  autoChecks(storeId: string): Promise<DbResult>; // view ads_auto_check
  productChannels(
    storeId: string,
    start: string,
    end: string,
  ): Promise<DbResult>; // view ads_product_channels
  adRows(storeId: string, start: string, end: string): Promise<DbResult>; // tabel ads_report
  panelRows(storeId: string, start: string, end: string): Promise<DbResult>; // view panel_product_period
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
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const rp = (n: number): string => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const pct1 = (n: number): string =>
  `${n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fail = (status: number, error: string): HandlerResult => ({
  status,
  json: { ok: false, error },
});

type Base = {
  nAds: number;
  impressions: number;
  clicks: number;
  unitsSold: number;
  gmv: number;
  cost: number;
};
function stat(base: Base): Omit<ChannelStat, "channel"> {
  return {
    ...base,
    roas: div(base.gmv, base.cost),
    acosPct: base.gmv > 0 ? (100 * base.cost) / base.gmv : null,
    costPerUnit: div(base.cost, base.unitsSold),
    costPerClick: div(base.cost, base.clicks),
    ctrPct:
      base.impressions > 0 ? (100 * base.clicks) / base.impressions : null,
    clickToUnitPct:
      base.clicks > 0 ? (100 * base.unitsSold) / base.clicks : null,
  };
}

function channelNums(
  cost: number,
  clicks: number,
  units: number,
  gmv: number,
): ChannelNums {
  return {
    cost,
    clicks,
    units,
    gmv,
    acosPct: gmv > 0 ? (100 * cost) / gmv : null,
    costPerUnit: div(cost, units),
  };
}

// ------------------------------------------------------------------ bacaan singkat

// Kalimat ringkas yang membandingkan dua jalur. Semua angka dari data; tidak ada vonis.
export function readChannels(
  ind: ChannelStat,
  auto: ChannelStat,
  products: ProductAds[],
): string[] {
  const out: string[] = [];
  if (ind.cost <= 0 && auto.cost <= 0) return out;
  if (auto.cost <= 0) {
    out.push(
      "Periode ini hanya ada iklan individual, tanpa Iklan Produk Otomatis.",
    );
    return out;
  }
  if (ind.cost <= 0) {
    out.push(
      "Periode ini hanya ada Iklan Produk Otomatis, tanpa iklan individual.",
    );
  } else if (ind.acosPct != null && auto.acosPct != null) {
    const cheaper = auto.acosPct < ind.acosPct ? "lebih hemat" : "lebih boros";
    out.push(
      `Per rupiah omzet iklan, Iklan Produk Otomatis ${cheaper} (ACOS ${pct1(auto.acosPct)} vs ${pct1(ind.acosPct)} untuk iklan individual).`,
    );
    if (auto.costPerUnit != null && ind.costPerUnit != null) {
      const cheaperU =
        auto.costPerUnit < ind.costPerUnit ? "lebih murah" : "lebih mahal";
      out.push(
        `Per pcs yang diklaim terjual, otomatis ${cheaperU}: ${rp(auto.costPerUnit)} vs ${rp(ind.costPerUnit)}.`,
      );
    }
  }
  const byAuto = [...products]
    .filter((p) => p.auto.cost > 0)
    .sort((a, b) => b.auto.cost - a.auto.cost);
  if (byAuto.length > 0 && auto.cost > 0) {
    const top = byAuto[0];
    const share = (100 * top.auto.cost) / auto.cost;
    if (share >= 50)
      out.push(
        `${pct1(share)} biaya otomatis menumpuk di satu produk (${top.productName ?? top.productId}).`,
      );
  }
  return out;
}

// ------------------------------------------------------------------ baca halaman

export type IklanQuery = {
  store?: string | null;
  start?: string | null;
  end?: string | null;
};

export async function handleIklan(
  deps: IklanDeps,
  admin: string | null,
  q: IklanQuery,
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  const storeId = q.store;
  if (typeof storeId !== "string" || !UUID_RE.test(storeId))
    return fail(400, "Pilih toko dulu.");
  const store = await deps.getStore(storeId);
  if (!store || store.marketplace !== "shopee" || store.managed_by !== admin)
    return fail(403, "Toko ini bukan toko Shopee milikmu.");
  const ref: StoreRef = { id: store.id, code: store.code, name: store.name };

  const [chRes, autoRes] = await Promise.all([
    deps.channelRows(store.id),
    deps.autoChecks(store.id),
  ]);
  if (chRes.error) return fail(500, `Gagal membaca data iklan: ${chRes.error}`);
  if (autoRes.error)
    return fail(500, `Gagal membaca rincian iklan: ${autoRes.error}`);

  const autoByKey = new Map<string, Rec>();
  for (const a of rowsOf(autoRes.data))
    autoByKey.set(`${dateOnly(a.period_start)}|${dateOnly(a.period_end)}`, a);

  // Periode = periode file iklan; biaya otomatis per periode dari baris jalur "otomatis".
  const byPeriod = new Map<string, IklanPeriod>();
  for (const c of rowsOf(chRes.data)) {
    const start = dateOnly(c.period_start);
    const end = dateOnly(c.period_end);
    if (!start || !end) continue;
    const key = `${start}|${end}`;
    const a = autoByKey.get(key);
    const cur = byPeriod.get(key) ?? {
      start,
      end,
      hasAutoDetail: a ? a.has_detail === true : false,
      autoCost: 0,
    };
    if (c.channel === "otomatis") cur.autoCost += num(c.cost);
    byPeriod.set(key, cur);
  }
  const periods = [...byPeriod.values()].sort((x, y) =>
    x.end === y.end ? (x.start < y.start ? 1 : -1) : x.end < y.end ? 1 : -1,
  ); // terbaru dulu
  if (periods.length === 0) {
    const empty: IklanEmpty = { ok: true, empty: true, store: ref };
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

  const [prodRes, adsRes, panelRes] = await Promise.all([
    deps.productChannels(store.id, period.start, period.end),
    deps.adRows(store.id, period.start, period.end),
    deps.panelRows(store.id, period.start, period.end),
  ]);
  if (prodRes.error)
    return fail(500, `Gagal membaca iklan per produk: ${prodRes.error}`);
  if (adsRes.error)
    return fail(500, `Gagal membaca daftar iklan: ${adsRes.error}`);
  if (panelRes.error)
    return fail(500, `Gagal membaca data panel: ${panelRes.error}`);

  // Jalur: selalu dua baris, walau salah satunya kosong.
  const base = (id: ChannelId): Base => {
    const rows = rowsOf(chRes.data).filter(
      (c) =>
        c.channel === id &&
        dateOnly(c.period_start) === period.start &&
        dateOnly(c.period_end) === period.end,
    );
    return {
      nAds: rows.reduce((a, c) => a + num(c.n_ads), 0),
      impressions: rows.reduce((a, c) => a + num(c.impressions), 0),
      clicks: rows.reduce((a, c) => a + num(c.clicks), 0),
      unitsSold: rows.reduce((a, c) => a + num(c.units_sold), 0),
      gmv: rows.reduce((a, c) => a + num(c.gmv), 0),
      cost: rows.reduce((a, c) => a + num(c.cost), 0),
    };
  };
  const bi = base("individual");
  const ba = base("otomatis");
  const channels: ChannelStat[] = [
    { channel: "individual", ...stat(bi) },
    { channel: "otomatis", ...stat(ba) },
  ];
  const total = stat({
    nAds: bi.nAds + ba.nAds,
    impressions: bi.impressions + ba.impressions,
    clicks: bi.clicks + ba.clicks,
    unitsSold: bi.unitsSold + ba.unitsSold,
    gmv: bi.gmv + ba.gmv,
    cost: bi.cost + ba.cost,
  });

  // Per produk: dua jalur berdampingan + penjualan nyata dari panel.
  const panelBy = new Map<string, Rec>();
  for (const p of rowsOf(panelRes.data)) {
    const id = str(p.product_id);
    if (id) panelBy.set(id, p);
  }
  const products: ProductAds[] = [];
  for (const x of rowsOf(prodRes.data)) {
    const productId = str(x.product_id);
    if (!productId) continue;
    const ind = channelNums(
      num(x.ind_cost),
      num(x.ind_clicks),
      num(x.ind_units),
      num(x.ind_gmv),
    );
    const auto = channelNums(
      num(x.auto_cost),
      num(x.auto_clicks),
      num(x.auto_units),
      num(x.auto_gmv),
    );
    const totalCost = ind.cost + auto.cost;
    if (totalCost <= 0 && ind.units + auto.units <= 0) continue; // tidak ada aktivitas iklan
    const pr = panelBy.get(productId);
    const realUnits = pr ? num(pr.valid_units) : null;
    const validOrders = pr ? num(pr.valid_orders) : null;
    const avgIncome = pr ? numOrNull(pr.avg_income) : null;
    const adCostPerUnit = pr ? numOrNull(pr.ad_cost_per_unit) : null;
    const claimedUnits = ind.units + auto.units;
    const adShare =
      avgIncome != null && avgIncome > 0 && adCostPerUnit != null
        ? (100 * adCostPerUnit) / avgIncome
        : null;

    const flags: AdFlag[] = [];
    if (auto.cost > 0 && auto.units === 0) flags.push("TANPA_HASIL_OTOMATIS");
    if (ind.cost > 0 && ind.units === 0) flags.push("TANPA_HASIL_INDIVIDUAL");
    const highAcos = (c: ChannelNums) =>
      c.cost >= HIGH_ACOS_MIN_COST &&
      c.acosPct != null &&
      c.acosPct >= HIGH_ACOS_PCT;
    if (highAcos(ind) || highAcos(auto)) flags.push("ACOS_TINGGI");
    if (
      adShare != null &&
      validOrders != null &&
      validOrders >= HIGH_AD_SHARE_MIN_ORDERS &&
      adShare >= HIGH_AD_SHARE_PCT
    )
      flags.push("IKLAN_MAHAL");

    products.push({
      productId,
      productName: str(x.product_name),
      ind,
      auto,
      totalCost,
      autoSharePct: totalCost > 0 ? (100 * auto.cost) / totalCost : null,
      claimedUnits,
      realUnits,
      claimPct:
        realUnits != null && realUnits > 0
          ? (100 * claimedUnits) / realUnits
          : null,
      validOrders,
      avgIncome,
      adCostPerUnit,
      netAfterAds: pr ? numOrNull(pr.net_after_ads) : null,
      adShareOfIncomePct: adShare,
      flags,
    });
  }
  products.sort(
    (a, b) =>
      b.totalCost - a.totalCost || a.productId.localeCompare(b.productId),
  );

  // Biaya yang tidak menghasilkan penjualan (bocor halus): per jalur per produk.
  let leakCost = 0;
  const leakProducts = new Set<string>();
  for (const p of products) {
    let any = false;
    if (p.auto.cost > 0 && p.auto.units === 0) {
      leakCost += p.auto.cost;
      any = true;
    }
    if (p.ind.cost > 0 && p.ind.units === 0) {
      leakCost += p.ind.cost;
      any = true;
    }
    if (any) leakProducts.add(p.productId);
  }
  const allCost = total.cost;
  const realTotal = rowsOf(panelRes.data).reduce(
    (a, p) => a + num(p.valid_units),
    0,
  );

  // Daftar iklan individual (bukan baris total otomatis).
  const ads: AdRow[] = rowsOf(adsRes.data)
    .filter((a) => str(a.product_code) !== "-")
    .map((a) => {
      const cost = num(a.cost);
      const gmv = num(a.gmv);
      return {
        adName: str(a.ad_name) ?? "-",
        productCode: str(a.product_code) ?? "-",
        status: str(a.status),
        biddingMode: str(a.bidding_mode),
        startedOn: dateOnly(a.started_on),
        impressions: num(a.impressions),
        clicks: num(a.clicks),
        unitsSold: num(a.units_sold),
        gmv,
        cost,
        roas: div(gmv, cost),
        acosPct: gmv > 0 ? (100 * cost) / gmv : null,
      };
    })
    .sort((a, b) => b.cost - a.cost || a.adName.localeCompare(b.adName));

  const warnings: string[] = [];
  if (period.autoCost > 0 && !period.hasAutoDetail) {
    warnings.push(
      "Rincian Iklan Produk Otomatis periode ini belum diupload, jadi kolom otomatis per produk kosong. Angka jalur otomatis di ringkasan tetap benar.",
    );
  }

  const data: IklanData = {
    ok: true,
    empty: false,
    store: ref,
    periods,
    period: { start: period.start, end: period.end },
    channels,
    total,
    leak: {
      products: leakProducts.size,
      cost: leakCost,
      sharePct: allCost > 0 ? (100 * leakCost) / allCost : null,
    },
    claim: {
      claimedUnits: total.unitsSold,
      realUnits: realTotal,
      pct: realTotal > 0 ? (100 * total.unitsSold) / realTotal : null,
    },
    reading: readChannels(channels[0], channels[1], products),
    thresholds: {
      highAcosPct: HIGH_ACOS_PCT,
      highAcosMinCost: HIGH_ACOS_MIN_COST,
      highAdSharePct: HIGH_AD_SHARE_PCT,
      highAdShareMinOrders: HIGH_AD_SHARE_MIN_ORDERS,
    },
    products,
    ads,
    warnings,
  };
  return { status: 200, json: data };
}
