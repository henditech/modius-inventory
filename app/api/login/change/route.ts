// app/api/login/change/route.ts
// Ganti password dari halaman login. Password lama diperiksa dengan aturan
// penguncian yang sama seperti login: tebakan password lama ikut dihitung ke
// 5 percobaan, jadi fitur ini bukan jalan baru untuk menebak.
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { verifyAdminPassword } from "@/lib/login-check";

const ALLOWED = ["hendi", "gita"];

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const { name, currentPassword, newPassword, hint } = await req.json();
  const key = (name || "").trim().toLowerCase();

  if (!ALLOWED.includes(key)) return fail("Nama tidak valid", 400);

  // Aturan password baru (sama dengan /api/login/setup)
  if (!newPassword || newPassword.length < 8) {
    return fail("Password baru minimal 8 karakter", 400);
  }
  // bcrypt hanya membaca 72 byte pertama; di atas itu sisanya diabaikan diam-diam.
  if (Buffer.byteLength(newPassword, "utf8") > 72) {
    return fail("Password terlalu panjang (maksimal 72 karakter)", 400);
  }
  if (newPassword === currentPassword) {
    return fail("Password baru harus beda dari yang lama", 400);
  }

  // Kata rahasia opsional: kosong = tetap pakai yang lama.
  const newHint = typeof hint === "string" ? hint.trim() : "";
  if (newHint && newHint.length < 2) {
    return fail("Kata rahasia minimal 2 karakter", 400);
  }
  // Hint bisa diminta siapa pun dari halaman login, jadi tidak boleh memuat passwordnya.
  if (newHint && newHint.toLowerCase().includes(newPassword.toLowerCase())) {
    return fail("Kata rahasia tidak boleh memuat password", 400);
  }

  const check = await verifyAdminPassword(
    supabaseAdmin,
    (p, h) => bcrypt.compare(p, h),
    key,
    currentPassword || "",
  );

  if (check.status === "error") {
    return fail("Gagal memeriksa akun, coba lagi", 500);
  }
  if (check.status === "no_password") {
    return fail("Password belum dibuat", 400);
  }
  if (check.status === "locked") {
    return NextResponse.json(
      {
        ok: false,
        error: `Terlalu banyak percobaan. Coba lagi dalam ${check.minutes} menit.`,
      },
      { status: 429, headers: { "Retry-After": String(check.minutes * 60) } },
    );
  }
  if (check.status === "wrong") {
    return fail("Password lama salah", 401);
  }

  // Kata rahasia lama yang dipertahankan juga tidak boleh memuat password baru.
  if (
    !newHint &&
    check.hint &&
    check.hint.toLowerCase().includes(newPassword.toLowerCase())
  ) {
    return fail(
      "Kata rahasia lama memuat password baru. Isi kata rahasia yang baru.",
      400,
    );
  }

  const password_hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabaseAdmin
    .from("admin_users")
    .update({
      password_hash,
      hint: newHint || check.hint || null,
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("name", key);

  if (error) return fail("Gagal menyimpan, coba lagi", 500);

  // Setelah ganti password, langsung anggap login (cookie bertanda tangan)
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(key),
    sessionCookieOptions(),
  );
  return res;
}
