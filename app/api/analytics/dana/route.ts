// app/api/analytics/dana/route.ts
// Data untuk tab Penghasilan dan Saldo. Identitas admin hanya dari cookie bertanda tangan.
// GET /api/analytics/dana?store=<uuid>[&from=YYYY-MM-DD&to=YYYY-MM-DD]
// Tanpa from/to, server memakai irisan data penghasilan dan saldo.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import { handleDana, type DanaDeps } from "@/lib/analytics/dana";

const analytics = supabaseAdmin.schema("analytics");

const deps: DanaDeps = {
  async getStore(storeId) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select(
        "id, name, code, managed_by, marketplace, marketplace_username, marketplace_shop_id",
      )
      .eq("id", storeId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  },
  async rpc(fn, args) {
    const { data, error } = await analytics.rpc(fn, args);
    return { data, error: error ? error.message : null };
  },
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handleDana(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
    from: sp.get("from"),
    to: sp.get("to"),
  });
  return NextResponse.json(json, { status });
}
