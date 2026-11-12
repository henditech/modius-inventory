// app/api/analytics/tt-penghasilan/route.ts
// Menyambungkan penangan tab Penghasilan TikTok (lib/analytics/ttPenghasilan.ts) ke Supabase
// dan cookie sesi. Identitas admin HANYA dari cookie bertanda tangan.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import {
  handleTtPenghasilan,
  type TtPenghasilanDeps,
} from "@/lib/analytics/ttPenghasilan";

const analytics = supabaseAdmin.schema("analytics");

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await analytics.rpc(fn, args);
  return {
    data: data as unknown,
    error: error ? (error.message as string) : null,
  };
}

const deps: TtPenghasilanDeps = {
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
  coverage: (storeId) => rpc("tt_coverage", { p_store: storeId }),
  summary: (storeId, from, to) =>
    rpc("tt_income_summary", { p_store: storeId, p_from: from, p_to: to }),
  daily: (storeId, from, to) =>
    rpc("tt_income_daily", { p_store: storeId, p_from: from, p_to: to }),
  qty: (storeId, from, to) =>
    rpc("tt_income_qty", { p_store: storeId, p_from: from, p_to: to }),
  pending: (storeId) => rpc("tt_pending_summary", { p_store: storeId }),
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handleTtPenghasilan(
    deps,
    getAdminFromRequest(req),
    { store: sp.get("store"), from: sp.get("from"), to: sp.get("to") },
  );
  return NextResponse.json(json, { status });
}
