// app/api/analytics/harga/route.ts
// Tab Harga: harga vs pcs terjual per produk. Identitas admin hanya dari cookie bertanda tangan.
//   GET /api/analytics/harga?store=<uuid>
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import { handleHarga, type HargaDeps } from "@/lib/analytics/harga";

const analytics = supabaseAdmin.schema("analytics");

const deps: HargaDeps = {
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

  async priceRows(storeId) {
    const { data, error } = await analytics
      .from("price_volume")
      .select(
        "product_id, product_name, price_band, price_min, price_max, first_day, last_day, days_sold, all_orders, all_units, valid_units, cancel_pct, units_per_day, avg_income, released_orders, est_net_per_day, enough_data",
      )
      .eq("store_id", storeId)
      .limit(5000);
    return { data, error: error ? error.message : null };
  },
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handleHarga(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
  });
  return NextResponse.json(json, { status });
}
