// app/api/analytics/tt-iklan/route.ts
// Menyambungkan penangan tab Iklan TikTok (lib/analytics/ttIklan.ts) ke Supabase dan cookie
// sesi. Identitas admin HANYA dari cookie bertanda tangan.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import {
  handleTtIklan,
  TT_IKLAN_DAILY_LIMIT,
  type TtIklanDeps,
} from "@/lib/analytics/ttIklan";

const analytics = supabaseAdmin.schema("analytics");

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await analytics.rpc(fn, args);
  return {
    data: data as unknown,
    error: error ? (error.message as string) : null,
  };
}

const deps: TtIklanDeps = {
  async getStore(storeId) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, code, managed_by, marketplace")
      .eq("id", storeId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  },
  coverage: (storeId) => rpc("tt_coverage", { p_store: storeId }),
  summary: (storeId, from, to) =>
    rpc("tt_ads_summary", { p_store: storeId, p_from: from, p_to: to }),
  // Satu baris per hari. Batasnya sengaja dibuat eksplisit; kalau tercapai, handler memberi
  // peringatan ke pengguna.
  async daily(storeId, from, to) {
    const { data, error } = await analytics
      .from("tt_ads_daily")
      .select("day, cost, sku_orders, gross_revenue")
      .eq("store_id", storeId)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true })
      .range(0, TT_IKLAN_DAILY_LIMIT - 1);
    return {
      data: data as unknown,
      error: error ? (error.message as string) : null,
    };
  },
  // Dipakai untuk membandingkan biaya iklan dengan dana yang benar-benar masuk.
  income: (storeId, from, to) =>
    rpc("tt_income_summary", { p_store: storeId, p_from: from, p_to: to }),
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handleTtIklan(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
    from: sp.get("from"),
    to: sp.get("to"),
  });
  return NextResponse.json(json, { status });
}
