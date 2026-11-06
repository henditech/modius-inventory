// app/api/analytics/pesanan/route.ts
// Data untuk tab Pesanan. Identitas admin hanya dari cookie bertanda tangan.
// GET /api/analytics/pesanan?store=<uuid>[&from=YYYY-MM-DD&to=YYYY-MM-DD]
// Tanpa from/to, server memakai seluruh data (kalau tidak lebih dari 45 hari) atau 30 hari terakhir.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import { handlePesanan, type PesananDeps } from "@/lib/analytics/pesanan";

const analytics = supabaseAdmin.schema("analytics");

const deps: PesananDeps = {
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
  const { status, json } = await handlePesanan(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
    from: sp.get("from"),
    to: sp.get("to"),
  });
  return NextResponse.json(json, { status });
}
