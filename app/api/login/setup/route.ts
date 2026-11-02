// app/api/login/setup/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

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
  if (!password || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Password minimal 8 karakter" },
      { status: 400 },
    );
  }
  // bcrypt hanya membaca 72 byte pertama; di atas itu sisanya diabaikan diam-diam.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return NextResponse.json(
      { ok: false, error: "Password terlalu panjang (maksimal 72 karakter)" },
      { status: 400 },
    );
  }
  if (!hint || hint.trim().length < 2) {
    return NextResponse.json(
      { ok: false, error: "Isi kata rahasia buat jaga-jaga lupa password" },
      { status: 400 },
    );
  }
  // Hint bisa diminta siapa pun dari halaman login, jadi tidak boleh memuat passwordnya.
  if (hint.toLowerCase().includes(password.toLowerCase())) {
    return NextResponse.json(
      { ok: false, error: "Kata rahasia tidak boleh memuat password" },
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

  const { error } = await supabaseAdmin.from("admin_users").upsert({
    name: key,
    password_hash,
    hint: hint.trim(),
    failed_attempts: 0,
    locked_until: null,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan, coba lagi" },
      { status: 500 },
    );
  }

  // Setelah bikin password, langsung anggap login (cookie bertanda tangan)
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken(key),
    sessionCookieOptions(),
  );
  return res;
}
