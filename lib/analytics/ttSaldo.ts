// lib/analytics/ttSaldo.ts
// Penangan tab Saldo TikTok: validasi masukan, cek kepemilikan toko, lalu menyusun angka dari
// fungsi SQL tt_wallet_summary (16_tiktok_saldo.sql) dan daftar penarikan dari analytics.tt_wallet.
// File ini tidak menyentuh Supabase langsung; route.ts yang menyuntikkan akses datanya
// (pola yang sama dengan ttPesanan.ts dan ttIklan.ts).
//
// PENTING: file TikTok tidak memuat saldo. Semua angka di sini adalah arus dana selama rentang,
// bukan saldo yang tersisa.

export type TtSaldoStore = {
  id: string;
  name: string;
  code: string;
  managed_by: string | null;
  marketplace: string;
};

type RpcResult = { data: unknown; error: string | null };

export type TtSaldoDeps = {
  getStore(storeId: string): Promise<TtSaldoStore | null>;
  coverage(storeId: string): Promise<RpcResult>;
  summary(storeId: string, from: string, to: string): Promise<RpcResult>;
  withdrawals(storeId: string, from: string, to: string): Promise<RpcResult>;
};

// Batas baris daftar penarikan. Kalau tercapai, pengguna diberi tahu (tidak diam-diam terpotong).
export const TT_SALDO_LIST_LIMIT = 200;
const OK_STATUS = "Transferred";

type StoreInfo = { id: string; name: string; code: string };

export type TtSaldoWithdrawal = {
  refId: string;
  requestedOn: string;
  amount: number; // negatif (uang keluar), sama seperti di file TikTok
  status: string | null;
  doneOn: string | null;
};

export type TtSaldoData = {
  ok: true;
  empty: false;
  store: StoreInfo;
  range: { from: string; to: string };
  coverage: { walletFirst: string; walletLast: string };
  summary: {
    entries: number;
    earnings: number;
    earningsCount: number;
    adsDeduction: number; // negatif
    withdrawals: number; // negatif
    withdrawalCount: number;
    otherAmount: number;
    otherCount: number;
    netChange: number; // dana masuk - iklan - penarikan (+ lainnya)
    largestWithdrawal: number; // positif
  };
  derived: {
    netIncome: number; // dana masuk + potongan iklan
    withdrawn: number; // total ditarik, positif
    avgWithdrawal: number | null;
    avgGapDays: number | null; // rata-rata jarak antar penarikan
  };
  withdrawals: TtSaldoWithdrawal[]; // terbaru dulu
  warnings: string[];
};

export type TtSaldoEmpty = { ok: true; empty: true; store: StoreInfo };

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
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string): boolean =>
  ISO.test(s) && !Number.isNaN(Date.parse(s));
const DAY = 86400000;

export async function handleTtSaldo(
  deps: TtSaldoDeps,
  admin: string | null,
  q: { store: string | null; from: string | null; to: string | null },
): Promise<{ status: number; json: TtSaldoData | TtSaldoEmpty | Failure }> {
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
      json: { ok: false, error: "Gagal memuat cakupan data saldo." },
    };
  }
  const c = firstRow(cov.data);
  const walletFirst =
    typeof c?.wallet_first === "string" ? c.wallet_first : null;
  const walletLast = typeof c?.wallet_last === "string" ? c.wallet_last : null;
  if (!walletFirst || !walletLast) {
    return { status: 200, json: { ok: true, empty: true, store: info } };
  }

  const from = q.from ?? walletFirst;
  const to = q.to ?? walletLast;
  if (!validDate(from) || !validDate(to) || from > to) {
    return {
      status: 400,
      json: { ok: false, error: "Rentang tanggal tidak valid." },
    };
  }

  const [sum, list] = await Promise.all([
    deps.summary(store.id, from, to),
    deps.withdrawals(store.id, from, to),
  ]);
  const s = firstRow(sum.data);
  if (sum.error || !s || list.error) {
    return {
      status: 500,
      json: { ok: false, error: "Gagal memuat data saldo." },
    };
  }

  const summary = {
    entries: num(s.entries),
    earnings: num(s.earnings),
    earningsCount: num(s.earnings_count),
    adsDeduction: num(s.ads_deduction),
    withdrawals: num(s.withdrawals),
    withdrawalCount: num(s.withdrawal_count),
    otherAmount: num(s.other_amount),
    otherCount: num(s.other_count),
    netChange: num(s.net_change),
    largestWithdrawal: num(s.largest_withdrawal),
  };

  const withdrawals: TtSaldoWithdrawal[] = rows(list.data).map((r) => ({
    refId: String(r.ref_id),
    requestedOn: String(r.requested_on),
    amount: num(r.amount),
    status: typeof r.status === "string" ? r.status : null,
    doneOn: typeof r.done_on === "string" ? r.done_on : null,
  }));

  // Rata-rata jarak antar penarikan (hari), dari tanggal permintaan terlama ke terbaru.
  let avgGapDays: number | null = null;
  if (withdrawals.length >= 2) {
    const dates = withdrawals.map((w) => Date.parse(w.requestedOn));
    const span = (Math.max(...dates) - Math.min(...dates)) / DAY;
    avgGapDays = Math.round((span / (withdrawals.length - 1)) * 10) / 10;
  }
  const withdrawn = Math.abs(summary.withdrawals);

  const warnings: string[] = [];
  if (summary.entries === 0) {
    warnings.push("Tidak ada data saldo di rentang ini.");
  } else if (from < walletFirst || to > walletLast) {
    warnings.push(
      "Rentang melewati data saldo yang tersimpan. Transaksi di luar periode itu belum diupload dan tidak ikut dihitung.",
    );
  }
  if (summary.otherCount > 0) {
    warnings.push(
      `${summary.otherCount} transaksi saldo berjenis di luar Earnings, GMV Pay Deduction, dan Withdrawal. Angkanya ikut dihitung di selisih periode; perlu dicek manual.`,
    );
  }
  const notDone = withdrawals.filter(
    (w) => w.status != null && w.status !== OK_STATUS,
  ).length;
  if (notDone > 0) {
    warnings.push(
      `${notDone} penarikan belum berstatus ${OK_STATUS} (mungkin masih diproses atau gagal).`,
    );
  }
  if (withdrawals.length >= TT_SALDO_LIST_LIMIT) {
    warnings.push(
      `Daftar penarikan dipotong di ${TT_SALDO_LIST_LIMIT} baris. Angka ringkasan tetap dihitung dari semua penarikan.`,
    );
  }

  return {
    status: 200,
    json: {
      ok: true,
      empty: false,
      store: info,
      range: { from, to },
      coverage: { walletFirst, walletLast },
      summary,
      derived: {
        netIncome: summary.earnings + summary.adsDeduction,
        withdrawn,
        avgWithdrawal:
          summary.withdrawalCount > 0
            ? withdrawn / summary.withdrawalCount
            : null,
        avgGapDays,
      },
      withdrawals,
      warnings,
    },
  };
}
