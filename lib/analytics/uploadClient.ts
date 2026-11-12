// lib/analytics/uploadClient.ts
// Dipakai halaman Analytics di browser. Dua langkah supaya halaman bisa menampilkan
// peringatan dan meminta konfirmasi di antaranya:
//   const c = await checkUpload(input, storeId);       // lolos? ada peringatan?
//   if (c.ok) await sendUpload(input, c.ticket, onProgress);
import type { UploadKind } from "./validate";

export const CHUNK_SIZE = 500;
export const ID_SAMPLE_SIZE = 200;

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type UploadInput = {
  kind: UploadKind;
  fileName: string;
  parsed: {
    rows: object[];
    store: { username?: string; shopId?: string };
    period: { start: string; end: string } | null;
    balanceFirst?: number;
    balanceLast?: number;
    // hanya ads_auto: jumlah di baris total file, untuk dicocokkan dengan file iklan utama
    fileTotal?: number | null;
  };
};

export type CheckResult =
  | {
      ok: true;
      ticket: string;
      warnings: string[];
      store: { code: string; name: string };
    }
  | { ok: false; error: string };

export type SendResult =
  | { ok: true; saved: number }
  | { ok: false; error: string; saved: number };

async function post(
  fetchFn: FetchLike,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const res = await fetchFn("/api/analytics/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.ok !== true) {
      return {
        ok: false,
        error:
          typeof data.error === "string" ? data.error : "Gagal, coba lagi.",
      };
    }
    return data;
  } catch {
    return { ok: false, error: "Gagal menghubungi server, coba lagi." };
  }
}

// Sampel nomor pesanan yang tersebar merata di seluruh file (bukan hanya 200 baris pertama),
// supaya server bisa memeriksa apakah nomor itu sudah tercatat di toko TikTok lain.
export function sampleIds(
  rows: object[],
  field: "order_id" | "entry_id",
  size: number = ID_SAMPLE_SIZE,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const v = (r as Record<string, unknown>)[field];
    if (typeof v === "string" && /^\d{6,30}$/.test(v) && !seen.has(v)) {
      seen.add(v);
      ids.push(v);
    }
  }
  if (ids.length <= size) return ids;
  const out: string[] = [];
  const step = ids.length / size;
  for (let i = 0; i < size; i++) out.push(ids[Math.floor(i * step)]);
  return out;
}

export async function checkUpload(
  input: UploadInput,
  storeId: string,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<CheckResult> {
  const rows = input.parsed.rows as { txn_at?: string }[];
  const body: Record<string, unknown> = {
    action: "check",
    storeId,
    kind: input.kind,
    fileName: input.fileName,
    fileStore: input.parsed.store,
    period: input.parsed.period,
    rowCount: rows.length,
  };
  if (
    input.kind === "wallet" &&
    rows.length > 0 &&
    input.parsed.balanceFirst != null &&
    input.parsed.balanceLast != null
  ) {
    body.wallet = {
      firstTxnAt: rows[0].txn_at,
      lastTxnAt: rows[rows.length - 1].txn_at,
      balanceFirst: input.parsed.balanceFirst,
      balanceLast: input.parsed.balanceLast,
    };
  }
  if (input.kind === "ads_auto" && typeof input.parsed.fileTotal === "number") {
    body.fileTotal = input.parsed.fileTotal;
  }
  if (input.kind === "tt_orders") {
    body.idSample = sampleIds(input.parsed.rows, "order_id");
  } else if (input.kind === "tt_income") {
    body.idSample = sampleIds(input.parsed.rows, "entry_id");
  }
  const r = await post(fetchFn, body);
  if (r.ok !== true) return { ok: false, error: String(r.error) };
  return {
    ok: true,
    ticket: String(r.ticket),
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
    store: r.store as { code: string; name: string },
  };
}

export async function sendUpload(
  input: UploadInput,
  ticket: string,
  onProgress?: (done: number, total: number) => void,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<SendResult> {
  const rows = input.parsed.rows;
  let saved = 0;
  onProgress?.(0, rows.length);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const r = await post(fetchFn, { action: "rows", ticket, rows: chunk });
    if (r.ok !== true) return { ok: false, error: String(r.error), saved };
    saved += chunk.length;
    onProgress?.(saved, rows.length);
  }

  const fin = await post(fetchFn, {
    action: "finish",
    ticket,
    fileName: input.fileName,
    period: input.parsed.period,
    rowCount: rows.length,
    balanceFirst: input.parsed.balanceFirst ?? null,
    balanceLast: input.parsed.balanceLast ?? null,
  });
  if (fin.ok !== true) return { ok: false, error: String(fin.error), saved };
  return { ok: true, saved };
}
