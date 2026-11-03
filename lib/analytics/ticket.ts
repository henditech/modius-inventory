// lib/analytics/ticket.ts
// Tiket upload bertanda tangan. Dibuat server setelah pemeriksaan awal lolos (toko milik
// admin itu, username file cocok) dan dipakai di setiap kiriman baris berikutnya, jadi
// server tidak perlu memeriksa ulang dan browser tidak bisa mengganti toko di tengah jalan.
// Memakai SESSION_SECRET yang sama, dengan awalan "upload:" supaya token sesi login
// tidak bisa dipakai sebagai tiket (dan sebaliknya).
import { createHmac, timingSafeEqual } from "crypto";
import { UPLOAD_KINDS, type UploadKind } from "./validate";

const TTL_MS = 30 * 60 * 1000; // 30 menit

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error("SESSION_SECRET belum diatur (minimal 32 karakter)");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret())
    .update("upload:" + payload)
    .digest("base64url");
}

export type UploadTicket = { admin: string; storeId: string; kind: UploadKind };

export function createUploadTicket(
  t: UploadTicket,
  nowMs: number = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ a: t.admin, s: t.storeId, k: t.kind, e: nowMs + TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUploadTicket(
  token: unknown,
  nowMs: number = Date.now(),
): UploadTicket | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;

  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof d.e !== "number" || d.e < nowMs) return null;
    if (typeof d.a !== "string" || typeof d.s !== "string") return null;
    if (!UPLOAD_KINDS.includes(d.k)) return null;
    return { admin: d.a, storeId: d.s, kind: d.k };
  } catch {
    return null;
  }
}
