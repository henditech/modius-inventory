// app/api/analytics/tt-pesanan/route.ts
// Menyambungkan penangan tab Pesanan TikTok (lib/analytics/ttPesanan.ts) ke Supabase dan
// cookie sesi. Identitas admin HANYA dari cookie bertanda tangan.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import { handleTtPesanan, type TtPesananDeps } from "@/lib/analytics/ttPesanan";

const analytics = supabaseAdmin.schema("analytics");

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await analytics.rpc(fn, args);
  return {
    data: data as unknown,
    error: error ? (error.message as string) : null,
  };
}

const deps: TtPesananDeps = {
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
    rpc("tt_orders_summary", { p_store: storeId, p_from: from, p_to: to }),
  reasons: (storeId, from, to) =>
    rpc("tt_orders_cancel_reasons", {
      p_store: storeId,
      p_from: from,
      p_to: to,
    }),
  products: (storeId, from, to) =>
    rpc("tt_orders_by_product", { p_store: storeId, p_from: from, p_to: to }),
  channels: (storeId, from, to) =>
    rpc("tt_orders_by_channel", { p_store: storeId, p_from: from, p_to: to }),
  creators: (storeId, from, to) =>
    rpc("tt_orders_by_creator", { p_store: storeId, p_from: from, p_to: to }),
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handleTtPesanan(
    deps,
    getAdminFromRequest(req),
    { store: sp.get("store"), from: sp.get("from"), to: sp.get("to") },
  );
  return NextResponse.json(json, { status });
}
