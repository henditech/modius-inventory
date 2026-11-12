// lib/analytics/ttIklan.ts
// Penangan tab Iklan TikTok: validasi masukan, cek kepemilikan toko, lalu menyusun angka dari
// fungsi SQL (13_tiktok_iklan.sql, 12_tiktok_penghasilan.sql) dan tabel analytics.tt_ads_daily.
// File ini tidak menyentuh Supabase langsung; route.ts yang menyuntikkan akses datanya
// (pola yang sama dengan ttPenghasilan.ts).

export type TtIklanStore = {
  id: string;
  name: string;
  code: string;
  managed_by: string | null;
  marketplace: string;
};

type RpcResult = { data: unknown; error: string | null };

export type TtIklanDeps = {
  getStore(storeId: string): Promise<TtIklanStore | null>;
  coverage(storeId: string): Promise<RpcResult>;
  summary(storeId: string, from: string, to: string): Promise<RpcResult>;
  daily(storeId: string, from: string, to: string): Promise<RpcResult>;
  income(storeId: string, from: string, to: string): Promise<RpcResult>;
};

// Batas baris tabel harian. Kalau terlampaui, pengguna diberi tahu (tidak diam-diam terpotong).
export const TT_IKLAN_DAILY_LIMIT = 1000;

export type TtIklanDay = {
  day: string;
  cost: number;
  skuOrders: number;
  grossRevenue: number;
  roi: number | null; // dihitung dari bruto / biaya; kosong kalau tidak ada biaya
};

export type TtIklanCompare = {
  ordersSettlement: number; // dana bersih dari pesanan, SEBELUM potongan iklan
  settlement: number; // dana bersih sesudah iklan
  adsCostIncome: number; // potongan GMV Pay di file income (negatif)
  revenue: number;
};

type StoreInfo = { id: string; name: string; code: string };

export type TtIklanData = {
  ok: true;
  empty: false;
  store: StoreInfo;
  range: { from: string; to: string };
  coverage: { adsFirst: string; adsLast: string };
  summary: {
    days: number;
    activeDays: number;
    cost: number;
    skuOrders: number;
    grossRevenue: number;
    roi: number | null;
    costPerOrder: number | null;
  };
  daily: TtIklanDay[];
  compare: TtIklanCompare | null;
  warnings: string[];
};

export type TtIklanEmpty = { ok: true; empty: true; store: StoreInfo };

type Failure = { ok: false; error: string };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const firstRow = (data: unknown): Record<string, unknown> | null => {
  if (Array.isArray(data))
    return (data[0] as Record<string, unknown> | undefined) ?? null;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string): boolean =>
  ISO.test(s) && !Number.isNaN(Date.parse(s));
const inclusiveDays = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export async function handleTtIklan(
  deps: TtIklanDeps,
  admin: string | null,
  q: { store: string | null; from: string | null; to: string | null },
): Promise<{ status: number; json: TtIklanData | TtIklanEmpty | Failure }> {
  if (!admin) {
    return {
      status: 401,
      json: {
        ok: false,
        error: "Sesi tidak valid. Masuk lagi lewat halaman login.",
      },
    };
  }
  if (!q.store) {
    return { status: 400, json: { ok: false, error: "Toko belum dipilih." } };
  }

  // Satu-satunya pagar akses: toko harus dikelola admin yang login dan memang toko TikTok.
  // Toko milik orang lain dan toko yang tidak ada dijawab sama (404) supaya ID toko tidak
  // bisa ditebak.
  const store = await deps.getStore(q.store);
  if (!store || store.managed_by !== admin || store.marketplace !== "tiktok") {
    return {
      status: 404,
      json: { ok: false, error: "Toko tidak ditemukan." },
    };
  }
  const info: StoreInfo = { id: store.id, name: store.name, code: store.code };

  const cov = await deps.coverage(store.id);
  if (cov.error) {
    return {
      status: 500,
      json: { ok: false, error: "Gagal memuat cakupan data iklan." },
    };
  }
  const c = firstRow(cov.data);
  const adsFirst = typeof c?.ads_first === "string" ? c.ads_first : null;
  const adsLast = typeof c?.ads_last === "string" ? c.ads_last : null;
  if (!adsFirst || !adsLast) {
    return { status: 200, json: { ok: true, empty: true, store: info } };
  }

  const from = q.from ?? adsFirst;
  const to = q.to ?? adsLast;
  if (!validDate(from) || !validDate(to) || from > to) {
    return {
      status: 400,
      json: { ok: false, error: "Rentang tanggal tidak valid." },
    };
  }

  const [sum, daily, inc] = await Promise.all([
    deps.summary(store.id, from, to),
    deps.daily(store.id, from, to),
    deps.income(store.id, from, to),
  ]);
  const s = firstRow(sum.data);
  if (sum.error || !s || daily.error) {
    return {
      status: 500,
      json: { ok: false, error: "Gagal memuat data iklan." },
    };
  }

  const dailyRows: TtIklanDay[] = (
    Array.isArray(daily.data) ? daily.data : []
  ).map((r: Record<string, unknown>) => {
    const cost = num(r.cost);
    const grossRevenue = num(r.gross_revenue);
    return {
      day: String(r.day),
      cost,
      skuOrders: num(r.sku_orders),
      grossRevenue,
      roi: cost > 0 ? Math.round((grossRevenue / cost) * 100) / 100 : null,
    };
  });

  // Perbandingan dengan file income bersifat tambahan: kalau gagal, halaman tetap tampil.
  const i = inc.error ? null : firstRow(inc.data);
  const compare: TtIklanCompare | null = i
    ? {
        ordersSettlement: num(i.orders_settlement),
        settlement: num(i.settlement),
        adsCostIncome: num(i.ads_cost),
        revenue: num(i.revenue),
      }
    : null;

  const days = num(s.days);
  const warnings: string[] = [];
  const rangeDays = inclusiveDays(from, to);
  if (days === 0) {
    warnings.push("Tidak ada data iklan di rentang ini.");
  } else if (days < rangeDays) {
    warnings.push(
      `Rentang ${rangeDays} hari, tapi data iklan baru ada untuk ${days} hari. Hari yang kosong belum diupload dan tidak ikut dihitung.`,
    );
  }
  if (dailyRows.length >= TT_IKLAN_DAILY_LIMIT) {
    warnings.push(
      `Tabel harian dipotong di ${TT_IKLAN_DAILY_LIMIT} hari. Angka ringkasan tetap dihitung dari semua hari.`,
    );
  }

  return {
    status: 200,
    json: {
      ok: true,
      empty: false,
      store: info,
      range: { from, to },
      coverage: { adsFirst, adsLast },
      summary: {
        days,
        activeDays: num(s.active_days),
        cost: num(s.cost),
        skuOrders: num(s.sku_orders),
        grossRevenue: num(s.gross_revenue),
        roi: numOrNull(s.roi),
        costPerOrder: numOrNull(s.cost_per_order),
      },
      daily: dailyRows,
      compare,
      warnings,
    },
  };
}
