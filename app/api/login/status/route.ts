// app/api/login/status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED = ["hendi", "gita"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("name") || "").trim().toLowerCase();

  if (!ALLOWED.includes(key)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("password_hash")
    .eq("name", key)
    .maybeSingle();

  return NextResponse.json({ hasPassword: !!data?.password_hash });
}
