// app/api/login/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const { name, password } = await req.json();
  const key = (name || "").trim().toLowerCase();

  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("password_hash")
    .eq("name", key)
    .maybeSingle();

  if (!data?.password_hash) {
    return NextResponse.json(
      { ok: false, error: "Password belum dibuat" },
      { status: 401 },
    );
  }

  const valid = await bcrypt.compare(password || "", data.password_hash);
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "Password salah" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("modius_session", key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

// Dipanggil saat user klik "Lupa password?" — cuma balikin hint, bukan passwordnya.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("name") || "").trim().toLowerCase();

  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("hint")
    .eq("name", key)
    .maybeSingle();

  return NextResponse.json({ hint: data?.hint || null });
}
