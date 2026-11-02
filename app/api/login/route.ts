// app/api/login/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { lockRemainingMinutes, nextFailureState } from "@/lib/login-lock";

const ALLOWED = ["hendi", "gita"];

function lockedResponse(minutes: number) {
  return NextResponse.json(
    {
      ok: false,
      error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`,
    },
    { status: 429, headers: { "Retry-After": String(minutes * 60) } },
  );
}

export async function POST(req: Request) {
  const { name, password } = await req.json();
  const key = (name || "").trim().toLowerCase();

  // Nama di luar daftar dijawab sama seperti password salah.
  if (!ALLOWED.includes(key)) {
    return NextResponse.json(
      { ok: false, error: "Password salah" },
      { status: 401 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("password_hash, failed_attempts, locked_until")
    .eq("name", key)
    .maybeSingle();

  // Kalau pemeriksaan akun gagal (mis. kolom penguncian belum dibuat), jangan lolos.
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa akun, coba lagi" },
      { status: 500 },
    );
  }

  if (!data?.password_hash) {
    return NextResponse.json(
      { ok: false, error: "Password belum dibuat" },
      { status: 401 },
    );
  }

  // Sedang terkunci: tolak tanpa memeriksa password.
  const wait = lockRemainingMinutes(data.locked_until);
  if (wait > 0) return lockedResponse(wait);

  const valid = await bcrypt.compare(password || "", data.password_hash);

  if (!valid) {
    const state = nextFailureState(data.failed_attempts);
    await supabaseAdmin
      .from("admin_users")
      .update({
        failed_attempts: state.failed_attempts,
        locked_until: state.locked_until,
      })
      .eq("name", key);
    if (state.locked) return lockedResponse(15);
    return NextResponse.json(
      { ok: false, error: "Password salah" },
      { status: 401 },
    );
  }

  // Berhasil: bersihkan hitungan gagal.
  if ((data.failed_attempts ?? 0) > 0 || data.locked_until) {
    await supabaseAdmin
      .from("admin_users")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("name", key);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(key),
    sessionCookieOptions(),
  );
  return res;
}

// Dipanggil saat user klik "Lupa password?" — cuma balikin hint, bukan passwordnya.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("name") || "").trim().toLowerCase();

  if (!ALLOWED.includes(key)) {
    return NextResponse.json({ hint: null });
  }

  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("hint")
    .eq("name", key)
    .maybeSingle();

  return NextResponse.json({ hint: data?.hint || null });
}
