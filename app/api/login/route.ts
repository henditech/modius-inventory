// app/api/login/route.ts
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

  const check = await verifyAdminPassword(
    supabaseAdmin,
    (p, h) => bcrypt.compare(p, h),
    key,
    password || "",
  );

  if (check.status === "error") {
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa akun, coba lagi" },
      { status: 500 },
    );
  }
  if (check.status === "no_password") {
    return NextResponse.json(
      { ok: false, error: "Password belum dibuat" },
      { status: 401 },
    );
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
    return NextResponse.json(
      { ok: false, error: "Password salah" },
      { status: 401 },
    );
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
