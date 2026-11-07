// lib/analytics/pesanan.ts
// Penangan data untuk tab Pesanan (tanpa Next dan tanpa Supabase langsung, supaya bisa diuji;
// pola sama dengan dana.ts). Semua angka dihitung di database (lihat 08_pesanan.sql) untuk
// rentang tanggal PESANAN DIBUAT, lalu dirapikan di sini: hari dan jam kosong diisi nol,
// persentase dan bacaan singkat dihitung, peringatan disusun.
import { addDays, daysBetween, isIsoDate, validateRange } from "./danaRange";
import type { StoreRow } from "./uploadHandler";
import { fmtDate } from "./uploadView";

export interface PesananDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: string | null }>;
}

export type StoreRef = { id: string; code: string; name: string };
export type DateRange = { from: string; to: string };

export type PesananSummary = {
  totalOrders: number;
  validOrders: number;
  cancelledOrders: number;
  unpaidOrders: number;
  inTransitOrders: number;
  cancelPct: number | null;
  validUnits: number;
  validGmv: number;
  avgOrderValue: number | null; // nilai pesanan valid / pesanan valid
  codOrders: number;
  codPct: number | null;
  cancelledAfterShip: number;
};
export type DayRow = {
  day: string;
  orders: number;
  validOrders: number;
  cancelledOrders: number;
  validGmv: number;
};
export type StatusRow = {
  status: string;
  orders: number;
  gmv: number;
  pct: number | null; // porsi dari seluruh pesanan
};
export type ReasonRow = {
  actor: string;
  reason: string;
  orders: number;
  afterShip: number;
  gmv: number;
  pctOfCancelled: number | null;
};
export type ActorRow = {
  actor: string;
  orders: number;
  afterShip: number;
  pctOfCancelled: number | null;
};
export type PayRow = {
  payment: string;
  orders: number;
  pctOfOrders: number | null;
  cancelledOrders: number;
  cancelledAfterShip: number;
  cancelPct: number | null;
  validGmv: number;
};
export type ShipRow = {
  service: string;
  orders: number;
  pctOfOrders: number | null;
  cancelledOrders: number;
  cancelledAfterShip: number;
  cancelPct: number | null;
};
export type HourRow = { hour: number; orders: number; validOrders: number };
// COD dan Non-COD, dengan penyebab batal dipisah (lihat 09_pesanan_batal.sql).
export type GroupRow = {
  group: string; // "COD" atau "Non-COD"
  orders: number;
  validOrders: number;
  cancelledOrders: number;
  unpaidCancelled: number; // batal karena belum dibayar
  failedDelivery: number; // gagal kirim (paket sudah jalan)
  otherCancelled: number; // batal lain, biasanya sebelum kirim
  inTransitOrders: number; // belum final
  cancelPct: number | null; // batal / pesanan
  cancelExUnpaidPct: number | null; // (batal - belum dibayar) / pesanan
  failedPct: number | null; // gagal kirim / pesanan
  validPct: number | null; // valid / pesanan
};

export type PesananData = {
  ok: true;
  empty: false;
  store: StoreRef;
  range: DateRange;
  coverage: { ordersFirst: string | null; ordersLast: string | null };
  summary: PesananSummary;
  daily: DayRow[]; // satu baris untuk SETIAP hari di rentang
  status: StatusRow[];
  cancel: { actors: ActorRow[]; reasons: ReasonRow[] };
  payment: PayRow[];
  shipping: ShipRow[];
  hours: HourRow[]; // selalu 24 baris, jam 0 sampai 23 (WIB)
  groups: GroupRow[]; // kosong kalau 09_pesanan_batal.sql belum dijalankan
  reading: string[];
  warnings: string[];
};
export type PesananEmpty = {
  ok: true;
  empty: true;
  store: StoreRef;
  coverage: { ordersFirst: string | null; ordersLast: string | null };
};

export type HandlerResult = { status: number; json: Record<string, unknown> };
export type PesananQuery = {
  store?: string | null;
  from?: string | null;
  to?: string | null;
};

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
const pctOf = (a: number, b: number): number | null =>
  b > 0 ? (100 * a) / b : null;
const nf = (n: number): string => Math.round(n).toLocaleString("id-ID");
const pct1 = (n: number): string =>
  `${n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const hh = (h: number): string => `${String(h).padStart(2, "0")}.00`;
const fail = (status: number, error: string): HandlerResult => ({
  status,
  json: { ok: false, error },
});

export const MIN_ORDERS_FOR_RATE = 20; // minimal pesanan agar persen batal satu kelompok layak disebut
const MAX_RANGE_DAYS = 400;
const DEFAULT_FULL_SPAN_DAYS = 45;

// ------------------------------------------------------------------ bacaan singkat

// Kalimat ringkas dari angka yang ada. Tidak ada vonis, hanya apa yang terlihat di data.
export function readOrders(
  s: PesananSummary,
  actors: ActorRow[],
  payment: PayRow[],
  hours: HourRow[],
  groups: GroupRow[] = [],
): string[] {
  const out: string[] = [];
  if (s.totalOrders <= 0) return out;

  // 1. Batal secara umum dan siapa yang membatalkan.
  if (s.cancelledOrders > 0 && s.cancelPct != null) {
    let t = `Dari ${nf(s.totalOrders)} pesanan, ${nf(s.cancelledOrders)} (${pct1(s.cancelPct)}) batal.`;
    const top = actors.filter((a) => a.pctOfCancelled != null).slice(0, 2);
    if (top.length > 0) {
      t += ` Yang membatalkan: ${top
        .map((a) => `${a.actor} ${pct1(a.pctOfCancelled as number)}`)
        .join(", ")}.`;
    }
    out.push(t);
  } else {
    out.push(`Dari ${nf(s.totalOrders)} pesanan, tidak ada yang batal.`);
  }

  // 2. COD dibanding non-COD.
  const cod = payment.filter((p) => p.payment.toUpperCase().startsWith("COD"));
  const non = payment.filter((p) => !p.payment.toUpperCase().startsWith("COD"));
  const codOrders = cod.reduce((a, p) => a + p.orders, 0);
  const nonOrders = non.reduce((a, p) => a + p.orders, 0);
  if (codOrders > 0 && nonOrders > 0) {
    const codCancel = pctOf(
      cod.reduce((a, p) => a + p.cancelledOrders, 0),
      codOrders,
    ) as number;
    const nonCancel = pctOf(
      non.reduce((a, p) => a + p.cancelledOrders, 0),
      nonOrders,
    ) as number;
    out.push(
      `COD ${pct1((100 * codOrders) / (codOrders + nonOrders))} dari pesanan dengan batal ${pct1(codCancel)}, dibanding ${pct1(nonCancel)} untuk pembayaran non-COD.`,
    );
  }

  // 2b. Penyebab batal per kelompok pembayaran (butuh 09_pesanan_batal.sql).
  const unpaidTotal = groups.reduce((a, g) => a + g.unpaidCancelled, 0);
  if (unpaidTotal > 0) {
    const who = groups.filter((g) => g.unpaidCancelled > 0);
    out.push(
      `Batal karena belum dibayar: ${nf(unpaidTotal)} pesanan${who.length === 1 ? ` (semuanya ${who[0].group})` : ""}.`,
    );
    const gc = groups.find((g) => g.group === "COD");
    const gn = groups.find((g) => g.group === "Non-COD");
    if (
      gc &&
      gn &&
      gc.cancelExUnpaidPct != null &&
      gn.cancelExUnpaidPct != null
    ) {
      out.push(
        `Di luar pesanan yang tidak dibayar, batal Non-COD ${pct1(gn.cancelExUnpaidPct)} dibanding COD ${pct1(gc.cancelExUnpaidPct)}.`,
      );
    }
  }

  // 3. Metode pembayaran dengan batal tertinggi (hanya yang cukup banyak pesanannya).
  const worst = payment
    .filter((p) => p.orders >= MIN_ORDERS_FOR_RATE && p.cancelPct != null)
    .sort((a, b) => (b.cancelPct as number) - (a.cancelPct as number))[0];
  if (worst && (worst.cancelPct as number) > (s.cancelPct ?? 0)) {
    out.push(
      `Batal tertinggi di ${worst.payment}: ${pct1(worst.cancelPct as number)} dari ${nf(worst.orders)} pesanan.`,
    );
  }

  // 4. Gagal kirim (paket sudah jalan). Tanpa data kelompok, pakai hitungan batal setelah resi.
  const failedGroups = groups.filter((g) => g.failedDelivery > 0);
  if (failedGroups.length > 0) {
    for (const g of failedGroups) {
      out.push(
        `Gagal kirim di ${g.group}: ${nf(g.failedDelivery)} pesanan (${pct1(g.failedPct ?? 0)} dari pesanan ${g.group}).`,
      );
    }
    for (const g of failedGroups) {
      if (g.inTransitOrders > 0)
        out.push(
          `Di ${g.group} masih ada ${nf(g.inTransitOrders)} pesanan dalam pengiriman, jadi angka gagal kirim masih bisa naik.`,
        );
    }
  } else if (s.cancelledAfterShip > 0) {
    out.push(
      `${nf(s.cancelledAfterShip)} pesanan batal setelah nomor resi dibuat (paket sudah diproses kirim).`,
    );
  }

  // 5. Jam tersibuk.
  const peak = [...hours]
    .filter((h) => h.orders > 0)
    .sort((a, b) => b.orders - a.orders || a.hour - b.hour)
    .slice(0, 3);
  if (peak.length > 0) {
    out.push(
      `Jam pesanan tersibuk (WIB): ${peak.map((h) => `${hh(h.hour)} (${nf(h.orders)})`).join(", ")}.`,
    );
  }
  return out;
}

// ------------------------------------------------------------------ baca halaman

export async function handlePesanan(
  deps: PesananDeps,
  admin: string | null,
  q: PesananQuery,
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

  // Cakupan data pesanan dulu: dipakai untuk rentang bawaan dan peringatan.
  const cov = await deps.rpc("coverage", { p_store: store.id });
  if (cov.error) return fail(500, `Gagal membaca cakupan data: ${cov.error}`);
  const c = rowsOf(cov.data)[0] ?? {};
  const ordersFirst = dateOnly(c.orders_first);
  const ordersLast = dateOnly(c.orders_last);
  const coverage = { ordersFirst, ordersLast };
  if (!ordersFirst || !ordersLast) {
    const empty: PesananEmpty = { ok: true, empty: true, store: ref, coverage };
    return { status: 200, json: empty };
  }

  // Rentang: dari permintaan, atau bawaan. Bawaan = seluruh data pesanan kalau cakupannya tidak
  // lebih dari 45 hari (supaya sebulan penuh persis sama dengan isi file), kalau lebih panjang
  // = 30 hari terakhir data yang ada.
  let range: DateRange;
  if (q.from || q.to) {
    if (!q.from || !q.to)
      return fail(400, "Isi tanggal awal dan akhir sekaligus.");
    if (!isIsoDate(q.from) || !isIsoDate(q.to))
      return fail(400, "Tanggal tidak valid.");
    const problem = validateRange(q.from, q.to, MAX_RANGE_DAYS);
    if (problem) return fail(400, problem);
    range = { from: q.from, to: q.to };
  } else {
    const span = daysBetween(ordersFirst, ordersLast) + 1;
    const back = addDays(ordersLast, -29);
    range =
      span <= DEFAULT_FULL_SPAN_DAYS || back <= ordersFirst
        ? { from: ordersFirst, to: ordersLast }
        : { from: back, to: ordersLast };
  }

  const a = { p_store: store.id, p_from: range.from, p_to: range.to };
  const calls = await Promise.all([
    deps.rpc("orders_summary", a),
    deps.rpc("orders_daily_range", a),
    deps.rpc("orders_by_status", a),
    deps.rpc("orders_cancel_reasons", a),
    deps.rpc("orders_by_payment", a),
    deps.rpc("orders_by_shipping", a),
    deps.rpc("orders_by_hour", a),
  ]);
  // Fungsi ini baru (09_pesanan_batal.sql). Kalau belum dijalankan, tab tetap tampil tanpa kartunya.
  const groupsCall = await deps.rpc("orders_cancel_groups", a);
  const failed = calls.find((x) => x.error);
  if (failed) return fail(500, `Gagal membaca data: ${failed.error}`);
  const [sum, daily, status, reasons, pay, ship, hours] = calls.map(
    (x) => x.data,
  );

  // ---- ringkasan
  const s0 = rowsOf(sum)[0] ?? {};
  const totalOrders = num(s0.total_orders);
  const validOrders = num(s0.valid_orders);
  const validGmv = num(s0.valid_gmv);
  const codOrders = num(s0.cod_orders);
  const summary: PesananSummary = {
    totalOrders,
    validOrders,
    cancelledOrders: num(s0.cancelled_orders),
    unpaidOrders: num(s0.unpaid_orders),
    inTransitOrders: num(s0.in_transit_orders),
    cancelPct: numOrNull(s0.cancel_pct),
    validUnits: num(s0.valid_units),
    validGmv,
    avgOrderValue: validOrders > 0 ? validGmv / validOrders : null,
    codOrders,
    codPct: pctOf(codOrders, totalOrders),
    cancelledAfterShip: num(s0.cancelled_after_ship),
  };

  // ---- per hari: satu baris untuk setiap hari di rentang
  const byDay = new Map<string, DayRow>();
  for (const x of rowsOf(daily)) {
    const day = dateOnly(x.day);
    if (!day) continue;
    byDay.set(day, {
      day,
      orders: num(x.orders),
      validOrders: num(x.valid_orders),
      cancelledOrders: num(x.cancelled_orders),
      validGmv: num(x.valid_gmv),
    });
  }
  const nDays = daysBetween(range.from, range.to) + 1;
  const dailyOut: DayRow[] = [];
  for (let i = 0; i < nDays; i++) {
    const day = addDays(range.from, i);
    dailyOut.push(
      byDay.get(day) ?? {
        day,
        orders: 0,
        validOrders: 0,
        cancelledOrders: 0,
        validGmv: 0,
      },
    );
  }

  // ---- status
  const statusOut: StatusRow[] = rowsOf(status)
    .map((x) => ({
      status: str(x.status) ?? "-",
      orders: num(x.orders),
      gmv: num(x.gmv),
      pct: pctOf(num(x.orders), totalOrders),
    }))
    .sort((x, y) => y.orders - x.orders || x.status.localeCompare(y.status));

  // ---- batal: alasan dan siapa yang membatalkan
  const cancelledTotal = summary.cancelledOrders;
  const reasonsOut: ReasonRow[] = rowsOf(reasons)
    .map((x) => ({
      actor: str(x.actor) ?? "Lainnya",
      reason: str(x.reason) ?? "(tanpa alasan)",
      orders: num(x.orders),
      afterShip: num(x.after_ship),
      gmv: num(x.gmv),
      pctOfCancelled: pctOf(num(x.orders), cancelledTotal),
    }))
    .sort(
      (x, y) =>
        y.orders - x.orders ||
        x.actor.localeCompare(y.actor) ||
        x.reason.localeCompare(y.reason),
    );
  // Siapa yang membatalkan = jumlah per pelaku. Dijumlah dari alasan; sebuah pesanan hanya
  // punya satu alasan, jadi jumlahnya sama dengan jumlah pesanan batal.
  const actorMap = new Map<string, ActorRow>();
  for (const r of reasonsOut) {
    const cur = actorMap.get(r.actor) ?? {
      actor: r.actor,
      orders: 0,
      afterShip: 0,
      pctOfCancelled: null,
    };
    cur.orders += r.orders;
    cur.afterShip += r.afterShip;
    actorMap.set(r.actor, cur);
  }
  const actors: ActorRow[] = [...actorMap.values()]
    .map((x) => ({ ...x, pctOfCancelled: pctOf(x.orders, cancelledTotal) }))
    .sort((x, y) => y.orders - x.orders || x.actor.localeCompare(y.actor));

  // ---- metode pembayaran dan layanan pengiriman
  const payment: PayRow[] = rowsOf(pay)
    .map((x) => {
      const orders = num(x.orders);
      const cancelled = num(x.cancelled_orders);
      return {
        payment: str(x.payment) ?? "-",
        orders,
        pctOfOrders: pctOf(orders, totalOrders),
        cancelledOrders: cancelled,
        cancelledAfterShip: num(x.cancelled_after_ship),
        cancelPct: pctOf(cancelled, orders),
        validGmv: num(x.valid_gmv),
      };
    })
    .sort((x, y) => y.orders - x.orders || x.payment.localeCompare(y.payment));
  const shipping: ShipRow[] = rowsOf(ship)
    .map((x) => {
      const orders = num(x.orders);
      const cancelled = num(x.cancelled_orders);
      return {
        service: str(x.service) ?? "-",
        orders,
        pctOfOrders: pctOf(orders, totalOrders),
        cancelledOrders: cancelled,
        cancelledAfterShip: num(x.cancelled_after_ship),
        cancelPct: pctOf(cancelled, orders),
      };
    })
    .sort((x, y) => y.orders - x.orders || x.service.localeCompare(y.service));

  // ---- COD dan Non-COD dengan penyebab batal
  const groups: GroupRow[] = groupsCall.error
    ? []
    : rowsOf(groupsCall.data)
        .map((x) => {
          const orders = num(x.orders);
          const cancelled = num(x.cancelled_orders);
          const unpaid = num(x.unpaid_cancelled);
          const failedDel = num(x.failed_delivery);
          return {
            group: str(x.grp) ?? "-",
            orders,
            validOrders: num(x.valid_orders),
            cancelledOrders: cancelled,
            unpaidCancelled: unpaid,
            failedDelivery: failedDel,
            otherCancelled: num(x.other_cancelled),
            inTransitOrders: num(x.in_transit_orders),
            cancelPct: pctOf(cancelled, orders),
            cancelExUnpaidPct: pctOf(cancelled - unpaid, orders),
            failedPct: pctOf(failedDel, orders),
            validPct: pctOf(num(x.valid_orders), orders),
          };
        })
        .sort((x, y) => y.orders - x.orders || x.group.localeCompare(y.group));

  // ---- per jam: selalu 24 baris
  const byHour = new Map<number, HourRow>();
  for (const x of rowsOf(hours)) {
    const h = num(x.hour_wib);
    if (Number.isInteger(h) && h >= 0 && h <= 23)
      byHour.set(h, {
        hour: h,
        orders: num(x.orders),
        validOrders: num(x.valid_orders),
      });
  }
  const hoursOut: HourRow[] = Array.from(
    { length: 24 },
    (_, h) => byHour.get(h) ?? { hour: h, orders: 0, validOrders: 0 },
  );

  // ---- peringatan
  const warnings: string[] = [];
  if (groupsCall.error)
    warnings.push(
      `Rincian batal per jenis pembayaran belum tersedia (jalankan 09_pesanan_batal.sql di Supabase). Pesan dari database: ${groupsCall.error}`,
    );
  if (range.to > ordersLast)
    warnings.push(
      `Data pesanan baru sampai ${fmtDate(ordersLast)}. Angka sesudah tanggal itu belum lengkap.`,
    );
  if (range.from < ordersFirst)
    warnings.push(
      `Data pesanan mulai ${fmtDate(ordersFirst)}. Angka sebelum tanggal itu belum lengkap.`,
    );
  if (summary.inTransitOrders > 0 && validOrders > 0) {
    warnings.push(
      `${nf(summary.inTransitOrders)} pesanan masih dalam pengiriman (${pct1((100 * summary.inTransitOrders) / validOrders)} dari pesanan valid). Sebagian masih bisa gagal kirim atau batal, jadi angka batal dan nilai pesanan valid masih bisa berubah. Upload ulang file pesanan untuk memperbarui statusnya.`,
    );
  }
  // Hari tanpa satu pun pesanan di dalam cakupan data: bisa wajar, bisa juga file belum lengkap.
  const lo = range.from > ordersFirst ? range.from : ordersFirst;
  const hi = range.to < ordersLast ? range.to : ordersLast;
  const zeroDays = dailyOut.filter(
    (d) => d.day >= lo && d.day <= hi && d.orders === 0,
  ).length;
  if (zeroDays >= 3)
    warnings.push(
      `${zeroDays} hari di rentang ini tidak punya satu pun pesanan. Kalau itu tidak wajar, mungkin ada file pesanan yang belum diupload.`,
    );

  const data: PesananData = {
    ok: true,
    empty: false,
    store: ref,
    range,
    coverage,
    summary,
    daily: dailyOut,
    status: statusOut,
    cancel: { actors, reasons: reasonsOut },
    payment,
    shipping,
    hours: hoursOut,
    groups,
    reading: readOrders(summary, actors, payment, hoursOut, groups),
    warnings,
  };
  return { status: 200, json: data };
}
