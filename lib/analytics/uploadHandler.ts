// lib/analytics/uploadHandler.ts
// Logika API upload (tanpa Next dan tanpa Supabase langsung) supaya bisa diuji.
// Route hanya menyambungkan ini ke supabaseAdmin dan cookie sesi.
//
// Alur dari browser:
//   1. check  : pilih toko + identitas file -> server memeriksa, memberi tiket + peringatan
//   2. rows   : kirim baris per 500 (bisa diulang; simpan memakai upsert, tidak dobel)
//   3. finish : catat di log upload
import { createUploadTicket, verifyUploadTicket } from "./ticket";
import { adsAutoCrossWarnings } from "./parseAdsAuto";
import {
  TABLES,
  UPLOAD_KINDS,
  checkStoreIdentity,
  isDateStr,
  sanitizeRows,
  type UploadKind,
} from "./validate";

export type StoreRow = {
  id: string;
  name: string;
  code: string;
  managed_by: string | null;
  marketplace: string | null;
  marketplace_username: string | null;
  marketplace_shop_id: string | null;
};

export type UploadLogEntry = {
  store_id: string;
  file_type: UploadKind;
  file_name: string;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  balance_first: number | null;
  balance_last: number | null;
  uploaded_by: string;
};

export interface UploadDeps {
  getStore(storeId: string): Promise<StoreRow | null>;
  upsert(
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string,
  ): Promise<{ error: string | null }>;
  walletNeighbours(
    storeId: string,
    firstTxnAt: string,
    lastTxnAt: string,
  ): Promise<{ prevBalance: number | null; nextStartBalance: number | null }>;
  insertUploadLog(entry: UploadLogEntry): Promise<{ error: string | null }>;
  now(): number;
  // Hanya untuk ads_auto: biaya Iklan Produk Otomatis di ads_report untuk periode persis itu.
  // reportCost null = file iklan utama periode itu belum diupload.
  adsAutoCompanion?(
    storeId: string,
    start: string,
    end: string,
  ): Promise<{ reportCost: number | null }>;
}

export type HandlerResult = { status: number; json: Record<string, unknown> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE_ROWS = 200000;

const fail = (status: number, error: string): HandlerResult => ({
  status,
  json: { ok: false, error },
});
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const optStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

function parsePeriod(
  v: unknown,
): { start: string; end: string } | null | "invalid" {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || !isDateStr(v.start) || !isDateStr(v.end)) return "invalid";
  return { start: v.start, end: v.end };
}

export async function handleUpload(
  deps: UploadDeps,
  admin: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (!admin)
    return fail(401, "Sesi tidak valid. Masuk lagi lewat halaman login.");
  if (!isObj(body)) return fail(400, "Permintaan tidak valid.");

  // ------------------------------------------------------------------ check
  if (body.action === "check") {
    const kind = body.kind as UploadKind;
    if (!UPLOAD_KINDS.includes(kind))
      return fail(400, "Jenis file tidak dikenal.");
    const storeId = body.storeId;
    if (typeof storeId !== "string" || !UUID_RE.test(storeId))
      return fail(400, "Pilih toko dulu.");

    const store = await deps.getStore(storeId);
    if (
      !store ||
      store.marketplace !== "shopee" ||
      store.managed_by !== admin
    ) {
      return fail(403, "Toko ini bukan toko Shopee milikmu.");
    }

    const rowCount = body.rowCount;
    if (
      typeof rowCount !== "number" ||
      !Number.isInteger(rowCount) ||
      rowCount < 1 ||
      rowCount > MAX_FILE_ROWS
    ) {
      return fail(400, "Jumlah baris di file tidak valid.");
    }

    const fs = isObj(body.fileStore) ? body.fileStore : {};
    const identity = checkStoreIdentity(kind, store, {
      username: optStr(fs.username),
      shopId: optStr(fs.shopId),
    });
    if (identity.error) return fail(409, identity.error);
    const warnings = [...identity.warnings];

    // Rincian iklan otomatis: cocokkan dengan file iklan utama periode yang sama.
    if (kind === "ads_auto" && deps.adsAutoCompanion) {
      const p = parsePeriod(body.period);
      if (p && p !== "invalid" && typeof body.fileTotal === "number") {
        const c = await deps.adsAutoCompanion(store.id, p.start, p.end);
        warnings.push(...adsAutoCrossWarnings(body.fileTotal, c.reportCost));
      }
    }

    // Saldo harus bersambung dengan data yang sudah tersimpan.
    if (kind === "wallet" && isObj(body.wallet)) {
      const w = body.wallet;
      if (
        typeof w.firstTxnAt === "string" &&
        typeof w.lastTxnAt === "string" &&
        typeof w.balanceFirst === "number" &&
        typeof w.balanceLast === "number"
      ) {
        const n = await deps.walletNeighbours(
          store.id,
          w.firstTxnAt,
          w.lastTxnAt,
        );
        if (
          n.prevBalance != null &&
          Math.abs(n.prevBalance - w.balanceFirst) > 0.5
        ) {
          warnings.push(
            `Saldo awal file (${rp(w.balanceFirst)}) tidak sama dengan saldo terakhir yang tersimpan sebelum tanggal itu (${rp(n.prevBalance)}). Kemungkinan ada periode saldo yang belum diupload.`,
          );
        }
        if (
          n.nextStartBalance != null &&
          Math.abs(n.nextStartBalance - w.balanceLast) > 0.5
        ) {
          warnings.push(
            `Saldo akhir file (${rp(w.balanceLast)}) tidak sama dengan saldo awal data yang sudah tersimpan sesudahnya (${rp(n.nextStartBalance)}). Kemungkinan ada periode saldo yang belum diupload.`,
          );
        }
      }
    }

    const ticket = createUploadTicket(
      { admin, storeId: store.id, kind },
      deps.now(),
    );
    return {
      status: 200,
      json: {
        ok: true,
        ticket,
        store: { code: store.code, name: store.name },
        warnings,
      },
    };
  }

  // ------------------------------------------------------------------ rows
  if (body.action === "rows") {
    const t = verifyUploadTicket(body.ticket, deps.now());
    if (!t || t.admin !== admin)
      return fail(
        401,
        "Sesi upload sudah kedaluwarsa. Ulangi dari pilih file.",
      );

    const clean = sanitizeRows(t.kind, body.rows, t.storeId);
    if (!clean.ok) return fail(400, clean.error);

    const cfg = TABLES[t.kind];
    const { error } = await deps.upsert(cfg.table, clean.rows, cfg.onConflict);
    if (error) return fail(500, `Gagal menyimpan ke database: ${error}`);
    return { status: 200, json: { ok: true, saved: clean.rows.length } };
  }

  // ------------------------------------------------------------------ finish
  if (body.action === "finish") {
    const t = verifyUploadTicket(body.ticket, deps.now());
    if (!t || t.admin !== admin)
      return fail(
        401,
        "Sesi upload sudah kedaluwarsa. Ulangi dari pilih file.",
      );

    const period = parsePeriod(body.period);
    if (period === "invalid") return fail(400, "Periode tidak valid.");
    const rowCount = body.rowCount;
    if (
      typeof rowCount !== "number" ||
      !Number.isInteger(rowCount) ||
      rowCount < 0 ||
      rowCount > MAX_FILE_ROWS
    ) {
      return fail(400, "Jumlah baris tidak valid.");
    }
    const fileName =
      typeof body.fileName === "string"
        ? body.fileName.trim().slice(0, 200)
        : "";
    const numOrNull = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;

    const { error } = await deps.insertUploadLog({
      store_id: t.storeId,
      file_type: t.kind,
      file_name: fileName || "(tanpa nama)",
      period_start: period ? period.start : null,
      period_end: period ? period.end : null,
      row_count: rowCount,
      balance_first: t.kind === "wallet" ? numOrNull(body.balanceFirst) : null,
      balance_last: t.kind === "wallet" ? numOrNull(body.balanceLast) : null,
      uploaded_by: admin,
    });
    if (error)
      return fail(
        500,
        `Data sudah tersimpan, tetapi gagal mencatat log upload: ${error}`,
      );
    return { status: 200, json: { ok: true } };
  }

  return fail(400, "Aksi tidak dikenal.");
}

// ------------------------------------------------------------------ ringkasan log

export type UploadLogRow = {
  store_id: string;
  file_type: string;
  file_name: string;
  period_start: string | null;
  period_end: string | null;
  row_count: number | null;
  uploaded_by: string;
  uploaded_at: string;
};

// Log terbaru per (toko, jenis file). Masukan sudah diurutkan dari yang terbaru.
export function latestPerStoreKind(
  logs: UploadLogRow[],
): Map<string, UploadLogRow> {
  const out = new Map<string, UploadLogRow>();
  for (const l of logs) {
    const k = `${l.store_id}|${l.file_type}`;
    if (!out.has(k)) out.set(k, l);
  }
  return out;
}
