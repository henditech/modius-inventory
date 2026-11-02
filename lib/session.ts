// lib/session.ts
// Sesi admin bertanda tangan (HMAC-SHA256). Cookie lama hanya berisi nama polos
// ("hendi"), yang bisa dipalsukan siapa pun lewat DevTools atau curl. Cookie baru
// berisi nama + waktu kedaluwarsa + tanda tangan, dan hanya server yang bisa membuatnya.
//
// Butuh environment variable SESSION_SECRET (minimal 32 karakter, acak).
// Buat dengan:  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
// Simpan di .env.local DAN di Vercel > Settings > Environment Variables (tanpa NEXT_PUBLIC_).
import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "modius_session";
const MAX_AGE_S = 60 * 60 * 24 * 7; // 7 hari, sama seperti sebelumnya

export type AdminName = "Hendi" | "Gita";

// key di admin_users (huruf kecil) -> nama seperti di stores.managed_by
const ADMIN_NAMES: Record<string, AdminName> = {
  hendi: "Hendi",
  gita: "Gita",
};

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET belum diatur (minimal 32 karakter)");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(key: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `${key}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(
  token: string | null | undefined,
): AdminName | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [key, expStr, sig] = parts;

  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(`${key}.${expStr}`));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return null;

  return ADMIN_NAMES[key] ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  };
}

// Dipakai di route handler: membaca admin dari cookie bertanda tangan.
// Mengembalikan null kalau tidak ada, rusak, dipalsukan, atau kedaluwarsa.
export function getAdminFromRequest(req: Request): AdminName | null {
  const header = req.headers.get("cookie") ?? "";
  const entry = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) return null;
  return verifySessionToken(
    decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1)),
  );
}
