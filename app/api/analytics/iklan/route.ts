// app/api/analytics/iklan/route.ts
// Tab Iklan: iklan individual vs Iklan Produk Otomatis. Identitas admin hanya dari cookie.
//   GET /api/analytics/iklan?store=<uuid>[&start=YYYY-MM-DD&end=YYYY-MM-DD]
//   Tanpa start/end: periode iklan terbaru.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import { handleIklan, type IklanDeps } from "@/lib/analytics/iklan";

const analytics = supabaseAdmin.schema("analytics");
const msg = (e: { message: string } | null) => (e ? e.message : null);

const deps: IklanDeps = {
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

  async channelRows(storeId) {
    const { data, error } = await analytics
      .from("ads_channel_summary")
      .select(
        "period_start, period_end, channel, n_ads, impressions, clicks, units_sold, gmv, cost",
      )
      .eq("store_id", storeId)
      .limit(400);
    return { data, error: msg(error) };
  },

  async autoChecks(storeId) {
    const { data, error } = await analytics
      .from("ads_auto_check")
      .select("period_start, period_end, has_detail")
      .eq("store_id", storeId)
      .limit(100);
    return { data, error: msg(error) };
  },

  async productChannels(storeId, start, end) {
    const { data, error } = await analytics
      .from("ads_product_channels")
      .select(
        "product_id, product_name, ind_cost, ind_clicks, ind_units, ind_gmv, auto_cost, auto_clicks, auto_units, auto_gmv",
      )
      .eq("store_id", storeId)
      .eq("period_start", start)
      .eq("period_end", end)
      .limit(1000);
    return { data, error: msg(error) };
  },

  async adRows(storeId, start, end) {
    const { data, error } = await analytics
      .from("ads_report")
      .select(
        "ad_name, product_code, status, bidding_mode, started_on, impressions, clicks, units_sold, gmv, cost",
      )
      .eq("store_id", storeId)
      .eq("period_start", start)
      .eq("period_end", end)
      .limit(1000);
    return { data, error: msg(error) };
  },

  async panelRows(storeId, start, end) {
    const { data, error } = await analytics
      .from("panel_product_period")
      .select(
        "product_id, valid_orders, valid_units, cancel_pct, avg_income, ad_cost_per_unit, net_after_ads",
      )
      .eq("store_id", storeId)
      .eq("period_start", start)
      .eq("period_end", end)
      .limit(1000);
    return { data, error: msg(error) };
  },
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handleIklan(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
    start: sp.get("start"),
    end: sp.get("end"),
  });
  return NextResponse.json(json, { status });
}
