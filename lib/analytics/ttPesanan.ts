// lib/analytics/ttPesanan.ts
// Penangan tab Pesanan TikTok: validasi masukan, cek kepemilikan toko, lalu menyusun angka dari
// fungsi SQL di 14_tiktok_pesanan.sql. Tidak menyentuh Supabase langsung; route.ts yang
// menyuntikkan akses datanya (pola yang sama dengan ttIklan.ts dan ttPenghasilan.ts).

export type TtPesananStore = {
  id: string;
  name: string;
  code: string;
  managed_by: string | null;
  marketplace: string;
};

type RpcResult = { data: unknown; error: string | null };

export type TtPesananDeps = {
  getStore(storeId: string): Promise<TtPesananStore | null>;
  coverage(storeId: string): Promise<RpcResult>;
  summary(storeId: string, from: string, to: string): Promise<RpcResult>;
  reasons(storeId: string, from: string, to: string): Promise<RpcResult>;
  products(storeId: string, from: string, to: string): Promise<RpcResult>;
  channels(storeId: string, from: string, to: string): Promise<RpcResult>;
  creators(storeId: string, from: string, to: string): Promise<RpcResult>;
};

// Sama dengan "limit 100" di tt_orders_by_product (14_tiktok_pesanan.sql).
export const TT_PESANAN_PRODUCT_LIMIT = 100;
// Sama dengan "limit 50" di tt_orders_by_creator (15_tiktok_pesanan_sumber.sql).
export const TT_PESANAN_CREATOR_LIMIT = 50;
// Label ini ditulis oleh fungsi SQL (15_tiktok_pesanan_sumber.sql) dan harus persis sama.
export const TT_CHANNEL_UNKNOWN = "(belum terisi)";
export const TT_CREATOR_UNKNOWN = "(kreator tidak tercatat)";

type StoreInfo = { id: string; name: string; code: string };

export type TtPesananReason = {
  reason: string;
  canceledBy: string;
  orders: number;
  lostValue: number;
  codOrders: number;
};

export type TtPesananProduct = {
  sku: string;
  product: string;
  orderLines: number;
  cancelledLines: number;
  pcsSold: number;
  sales: number;
  pcsReturned: number;
};

export type TtPesananChannel = {
  channel: string;
  orders: number;
  cancelled: number;
  cancelPct: number | null;
  sales: number;
  pcs: number;
};

export type TtPesananCreator = {
  creator: string;
  orders: number;
  cancelled: number;
  cancelPct: number | null;
  sales: number;
  settledOrders: number; // pesanan yang dananya sudah cair (komisi hanya ada untuk ini)
  commission: number; // negatif = potongan
  settlement: number;
};

export type TtPesananData = {
  ok: true;
  empty: false;
  store: StoreInfo;
  range: { from: string; to: string };
  coverage: { ordersFirst: string; ordersLast: string };
  summary: {
    orders: number;
    pcs: number;
    orderValue: number;
    completed: number;
    shipping: number;
    cancelled: number;
    returned: number;
    otherStatus: number;
    cancelledValue: number;
    codOrders: number;
    codCancelled: number;
    nonCodOrders: number;
    nonCodCancelled: number;
  };
  // Semua persen dalam skala 0-100, satu desimal; kosong kalau pembaginya nol.
  rates: {
    cancelPct: number | null;
    codPct: number | null;
    codCancelPct: number | null;
    nonCodCancelPct: number | null;
  };
  reasons: TtPesananReason[];
  products: TtPesananProduct[];
  channels: TtPesananChannel[];
  creators: TtPesananCreator[];
  warnings: string[];
};

export type TtPesananEmpty = { ok: true; empty: true; store: StoreInfo };

type Failure = { ok: false; error: string };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const firstRow = (data: unknown): Record<string, unknown> | null => {
  if (Array.isArray(data))
    return (data[0] as Record<string, unknown> | undefined) ?? null;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
};
const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string): boolean =>
  ISO.test(s) && !Number.isNaN(Date.parse(s));

export async function handleTtPesanan(
  deps: TtPesananDeps,
  admin: string | null,
  q: { store: string | null; from: string | null; to: string | null },
): Promise<{ status: number; json: TtPesananData | TtPesananEmpty | Failure }> {
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
      json: { ok: false, error: "Gagal memuat cakupan data pesanan." },
    };
  }
  const c = firstRow(cov.data);
  const ordersFirst =
    typeof c?.orders_first === "string" ? c.orders_first : null;
  const ordersLast = typeof c?.orders_last === "string" ? c.orders_last : null;
  if (!ordersFirst || !ordersLast) {
    return { status: 200, json: { ok: true, empty: true, store: info } };
  }

  const from = q.from ?? ordersFirst;
  const to = q.to ?? ordersLast;
  if (!validDate(from) || !validDate(to) || from > to) {
    return {
      status: 400,
      json: { ok: false, error: "Rentang tanggal tidak valid." },
    };
  }

  const [sum, reasons, products, channels, creators] = await Promise.all([
    deps.summary(store.id, from, to),
    deps.reasons(store.id, from, to),
    deps.products(store.id, from, to),
    deps.channels(store.id, from, to),
    deps.creators(store.id, from, to),
  ]);
  const s = firstRow(sum.data);
  if (
    sum.error ||
    !s ||
    reasons.error ||
    products.error ||
    channels.error ||
    creators.error
  ) {
    return {
      status: 500,
      json: { ok: false, error: "Gagal memuat data pesanan." },
    };
  }

  const summary = {
    orders: num(s.orders),
    pcs: num(s.pcs),
    orderValue: num(s.order_value),
    completed: num(s.completed),
    shipping: num(s.shipping),
    cancelled: num(s.cancelled),
    returned: num(s.returned),
    otherStatus: num(s.other_status),
    cancelledValue: num(s.cancelled_value),
    codOrders: num(s.cod_orders),
    codCancelled: num(s.cod_cancelled),
    nonCodOrders: num(s.noncod_orders),
    nonCodCancelled: num(s.noncod_cancelled),
  };

  const productRows: TtPesananProduct[] = rows(products.data).map((r) => ({
    sku: String(r.sku),
    product: String(r.product ?? ""),
    orderLines: num(r.order_lines),
    cancelledLines: num(r.cancelled_lines),
    pcsSold: num(r.pcs_sold),
    sales: num(r.sales),
    pcsReturned: num(r.pcs_returned),
  }));

  const channelRows: TtPesananChannel[] = rows(channels.data).map((r) => {
    const orders = num(r.orders);
    const cancelled = num(r.cancelled);
    return {
      channel: String(r.channel),
      orders,
      cancelled,
      cancelPct: pct(cancelled, orders),
      sales: num(r.sales),
      pcs: num(r.pcs),
    };
  });

  const creatorRows: TtPesananCreator[] = rows(creators.data).map((r) => {
    const orders = num(r.orders);
    const cancelled = num(r.cancelled);
    return {
      creator: String(r.creator),
      orders,
      cancelled,
      cancelPct: pct(cancelled, orders),
      sales: num(r.sales),
      settledOrders: num(r.settled_orders),
      commission: num(r.commission),
      settlement: num(r.settlement),
    };
  });

  const warnings: string[] = [];
  if (summary.orders === 0) {
    warnings.push("Tidak ada pesanan di rentang ini.");
  } else if (from < ordersFirst || to > ordersLast) {
    warnings.push(
      "Rentang melewati data pesanan yang tersimpan. Pesanan di luar periode itu belum diupload dan tidak ikut dihitung.",
    );
  }
  if (summary.otherStatus > 0) {
    warnings.push(
      `${summary.otherStatus} pesanan berstatus di luar Selesai, Dikirim, dan Dibatalkan (misalnya belum dibayar). Angka untuk status ini perlu dicek manual.`,
    );
  }
  const noChannel = channelRows.find((c) => c.channel === TT_CHANNEL_UNKNOWN);
  if (noChannel && noChannel.orders > 0) {
    warnings.push(
      `${noChannel.orders} pesanan belum punya data sumber dan kreator (diupload sebelum kolom itu ada). Upload ulang file pesanan periode ini supaya terisi.`,
    );
  }
  if (creatorRows.length >= TT_PESANAN_CREATOR_LIMIT) {
    warnings.push(
      `Daftar kreator dipotong di ${TT_PESANAN_CREATOR_LIMIT} kreator. Angka ringkasan tetap dihitung dari semua pesanan.`,
    );
  }
  if (productRows.length >= TT_PESANAN_PRODUCT_LIMIT) {
    warnings.push(
      `Daftar produk dipotong di ${TT_PESANAN_PRODUCT_LIMIT} produk. Angka ringkasan tetap dihitung dari semua pesanan.`,
    );
  }

  return {
    status: 200,
    json: {
      ok: true,
      empty: false,
      store: info,
      range: { from, to },
      coverage: { ordersFirst, ordersLast },
      summary,
      rates: {
        cancelPct: pct(summary.cancelled, summary.orders),
        codPct: pct(summary.codOrders, summary.orders),
        codCancelPct: pct(summary.codCancelled, summary.codOrders),
        nonCodCancelPct: pct(summary.nonCodCancelled, summary.nonCodOrders),
      },
      reasons: rows(reasons.data).map((r) => ({
        reason: String(r.reason),
        canceledBy: String(r.canceled_by),
        orders: num(r.orders),
        lostValue: num(r.lost_value),
        codOrders: num(r.cod_orders),
      })),
      products: productRows,
      channels: channelRows,
      creators: creatorRows,
      warnings,
    },
  };
}
