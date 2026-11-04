// lib/analytics/dana.ts
// Penangan data untuk tab Penghasilan dan Saldo (tanpa Next dan tanpa Supabase langsung,
// supaya bisa diuji). Satu permintaan mengembalikan semua yang dibutuhkan kedua tab.
// Toko diperiksa milik admin yang login, dan semua angka dihitung di database
// (lihat 06_dana.sql).
import type { StoreRow } from "./uploadHandler";
import {
  defaultRange,
  isIsoDate,
  validateRange,
  type Coverage,
  type DateRange,
} from "./danaRange";

export interface DanaDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: string | null }>;
}

export type FeeItem = { ord: number; item: string; total: number };
export type WalletWeek = {
  weekStart: string;
  nTxn: number;
  opening: number | null;
  orderIncome: number;
  adjustments: number;
  adTopups: number;
  withdrawals: number;
  other: number;
  netChange: number;
  closing: number | null;
  checkDiff: number;
};
export type ReconSummary = {
  status: string;
  orders: number;
  incomeSum: number;
  walletSum: number;
  diff: number;
};
export type ReconRow = {
  orderNo: string;
  releasedOn: string | null;
  txnOn: string | null;
  income: number | null;
  walletAmount: number | null;
  diff: number;
  status: string;
};
export type PendingRow = {
  orderNo: string;
  orderedOn: string | null;
  status: string;
  subtotal: number;
};
export type Withdrawal = {
  txnAt: string;
  amount: number;
  status: string | null;
  balanceAfter: number;
};
export type StoreRef = { id: string; code: string; name: string };

export type DanaData = {
  ok: true;
  empty: false;
  store: StoreRef;
  range: DateRange;
  coverage: Coverage;
  income: {
    orders: number;
    lines: number;
    subtotal: number;
    incomeSum: number;
    incomePct: number | null;
    unexplained: number;
    fees: FeeItem[];
  };
  wallet: {
    nTxn: number;
    opening: number | null;
    orderIncome: number;
    adjustments: number;
    adTopups: number;
    withdrawals: number;
    other: number;
    netChange: number;
    closing: number | null;
    checkDiff: number;
    weeks: WalletWeek[];
    withdrawalList: Withdrawal[];
  };
  reconcile: { summary: ReconSummary[]; rows: ReconRow[]; truncated: boolean };
  pending: {
    orders: number;
    subtotal: number;
    oldest: string | null;
    rows: PendingRow[];
  };
};
export type DanaEmpty = {
  ok: true;
  empty: true;
  store: StoreRef;
  coverage: Coverage;
};

export type HandlerResult = { status: number; json: Record<string, unknown> };
export type DanaQuery = {
  store?: string | null;
  from?: string | null;
  to?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RECON_ROW_LIMIT = 200;
const PENDING_ROW_LIMIT = 50;

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

const fail = (status: number, error: string): HandlerResult => ({
  status,
  json: { ok: false, error },
});

export async function handleDana(
  deps: DanaDeps,
  admin: string | null,
  q: DanaQuery,
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");

  const storeId = q.store;
  if (typeof storeId !== "string" || !UUID_RE.test(storeId))
    return fail(400, "Pilih toko dulu.");
  const store = await deps.getStore(storeId);
  if (!store || store.marketplace !== "shopee" || store.managed_by !== admin) {
    return fail(403, "Toko ini bukan toko Shopee milikmu.");
  }
  const ref: StoreRef = { id: store.id, code: store.code, name: store.name };

  // Cakupan data dulu: dipakai untuk rentang bawaan dan peringatan.
  const cov = await deps.rpc("coverage", { p_store: store.id });
  if (cov.error) return fail(500, `Gagal membaca cakupan data: ${cov.error}`);
  const c = rowsOf(cov.data)[0] ?? {};
  const coverage: Coverage = {
    incomeFirst: dateOnly(c.income_first),
    incomeLast: dateOnly(c.income_last),
    walletFirst: dateOnly(c.wallet_first),
    walletLast: dateOnly(c.wallet_last),
    ordersFirst: dateOnly(c.orders_first),
    ordersLast: dateOnly(c.orders_last),
  };

  // Rentang: dari permintaan, atau bawaan.
  let range: DateRange | null;
  if (q.from || q.to) {
    if (!q.from || !q.to)
      return fail(400, "Isi tanggal awal dan akhir sekaligus.");
    if (!isIsoDate(q.from) || !isIsoDate(q.to))
      return fail(400, "Tanggal tidak valid.");
    const problem = validateRange(q.from, q.to);
    if (problem) return fail(400, problem);
    range = { from: q.from, to: q.to };
  } else {
    range = defaultRange(coverage);
  }
  if (!range) {
    const empty: DanaEmpty = { ok: true, empty: true, store: ref, coverage };
    return { status: 200, json: empty };
  }

  const a = { p_store: store.id, p_from: range.from, p_to: range.to };
  const calls = await Promise.all([
    deps.rpc("income_summary", a),
    deps.rpc("fee_breakdown", a),
    deps.rpc("wallet_summary", a),
    deps.rpc("wallet_weeks", a),
    deps.rpc("wallet_withdrawals", a),
    deps.rpc("reconcile_summary", a),
    deps.rpc("reconcile_rows", { ...a, p_limit: RECON_ROW_LIMIT + 1 }),
    deps.rpc("pending_summary", { p_store: store.id }),
    deps.rpc("pending_rows", { p_store: store.id, p_limit: PENDING_ROW_LIMIT }),
  ]);
  const failed = calls.find((x) => x.error);
  if (failed) return fail(500, `Gagal membaca data: ${failed.error}`);
  const [inc, fees, wal, weeks, wd, recSum, recRows, pendSum, pendRows] =
    calls.map((x) => x.data);

  const i = rowsOf(inc)[0] ?? {};
  const w = rowsOf(wal)[0] ?? {};
  const p = rowsOf(pendSum)[0] ?? {};
  const rr = rowsOf(recRows);

  const data: DanaData = {
    ok: true,
    empty: false,
    store: ref,
    range,
    coverage,
    income: {
      orders: num(i.orders),
      lines: num(i.lines),
      subtotal: num(i.subtotal),
      incomeSum: num(i.income_sum),
      incomePct: numOrNull(i.income_pct),
      unexplained: num(i.unexplained),
      fees: rowsOf(fees)
        .map((f) => ({
          ord: num(f.ord),
          item: str(f.item) ?? "-",
          total: num(f.total),
        }))
        .sort((x, y) => x.ord - y.ord),
    },
    wallet: {
      nTxn: num(w.n_txn),
      opening: numOrNull(w.opening_balance),
      orderIncome: num(w.order_income),
      adjustments: num(w.adjustments),
      adTopups: num(w.ad_topups),
      withdrawals: num(w.withdrawals),
      other: num(w.other),
      netChange: num(w.net_change),
      closing: numOrNull(w.closing_balance),
      checkDiff: num(w.check_diff),
      weeks: rowsOf(weeks).map((x) => ({
        weekStart: dateOnly(x.week_start) ?? "",
        nTxn: num(x.n_txn),
        opening: numOrNull(x.opening_balance),
        orderIncome: num(x.order_income),
        adjustments: num(x.adjustments),
        adTopups: num(x.ad_topups),
        withdrawals: num(x.withdrawals),
        other: num(x.other),
        netChange: num(x.net_change),
        closing: numOrNull(x.closing_balance),
        checkDiff: num(x.check_diff),
      })),
      withdrawalList: rowsOf(wd).map((x) => ({
        txnAt: str(x.txn_at) ?? "",
        amount: num(x.amount),
        status: str(x.status),
        balanceAfter: num(x.balance_after),
      })),
    },
    reconcile: {
      summary: rowsOf(recSum)
        .map((x) => ({
          status: str(x.status) ?? "-",
          orders: num(x.orders),
          incomeSum: num(x.income_sum),
          walletSum: num(x.wallet_sum),
          diff: num(x.diff),
        }))
        .sort((x, y) => x.status.localeCompare(y.status)),
      rows: rr.slice(0, RECON_ROW_LIMIT).map((x) => ({
        orderNo: str(x.order_no) ?? "-",
        releasedOn: dateOnly(x.released_on),
        txnOn: dateOnly(x.txn_on),
        income: numOrNull(x.income),
        walletAmount: numOrNull(x.wallet_amount),
        diff: num(x.diff),
        status: str(x.status) ?? "-",
      })),
      truncated: rr.length > RECON_ROW_LIMIT,
    },
    pending: {
      orders: num(p.orders),
      subtotal: num(p.subtotal),
      oldest: dateOnly(p.oldest),
      rows: rowsOf(pendRows).map((x) => ({
        orderNo: str(x.order_no) ?? "-",
        orderedOn: dateOnly(x.ordered_on),
        status: str(x.status) ?? "-",
        subtotal: num(x.subtotal),
      })),
    },
  };
  return { status: 200, json: data };
}
