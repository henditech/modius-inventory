// app/api/login/setup/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED = ["hendi", "gita"];

export async function POST(req: Request) {
  const { name, password, hint } = await req.json();
  const key = (name || "").trim().toLowerCase();

  if (!ALLOWED.includes(key)) {
    return NextResponse.json(
      { ok: false, error: "Nama tidak valid" },
      { status: 400 },
    );
  }
  if (!password || password.length < 4) {
    return NextResponse.json(
      { ok: false, error: "Password minimal 4 karakter" },
      { status: 400 },
    );
  }
  if (!hint || hint.trim().length < 2) {
    return NextResponse.json(
      { ok: false, error: "Isi kata rahasia buat jaga-jaga lupa password" },
      { status: 400 },
    );
  }

  // Cegah endpoint ini dipakai buat menimpa password yang sudah ada
  const { data: existing } = await supabaseAdmin
    .from("admin_users")
    .select("password_hash")
    .eq("name", key)
    .maybeSingle();

  if (existing?.password_hash) {
    return NextResponse.json(
      { ok: false, error: "Password sudah pernah dibuat sebelumnya" },
      { status: 400 },
    );
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { error } = await supabaseAdmin
    .from("admin_users")
    .upsert({ name: key, password_hash, hint: hint.trim() });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan, coba lagi" },
      { status: 500 },
    );
  }

  // Setelah bikin password, langsung anggap login
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
