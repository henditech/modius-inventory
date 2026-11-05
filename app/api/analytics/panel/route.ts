// app/api/analytics/panel/route.ts
// Panel target. Identitas admin hanya dari cookie bertanda tangan.
//   GET  /api/analytics/panel?store=<uuid>[&start=YYYY-MM-DD&end=YYYY-MM-DD]
//        Tanpa start/end: periode iklan terbaru.
//   POST /api/analytics/panel  { store, kind: "kerja", target, effectiveFrom, note? }
//        Menyimpan target kerja toko. Riwayat dicatat otomatis oleh trigger di database.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import {
  handlePanel,
  handleSetTarget,
  type PanelDeps,
} from "@/lib/analytics/panel";

const analytics = supabaseAdmin.schema("analytics");
const msg = (e: { message: string } | null) => (e ? e.message : null);

const deps: PanelDeps = {
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

  async periodChecks(storeId) {
    const { data, error } = await analytics
      .from("panel_period_check")
      .select(
        "period_start, period_end, ad_cost_total, ad_cost_mapped, unmatched_orders",
      )
      .eq("store_id", storeId)
      .limit(100);
    return { data, error: msg(error) };
  },

  async autoChecks(storeId) {
    const { data, error } = await analytics
      .from("ads_auto_check")
      .select("period_start, period_end, report_cost, has_detail")
      .eq("store_id", storeId)
      .limit(100);
    return { data, error: msg(error) };
  },

  async productRows(storeId, start, end) {
    const { data, error } = await analytics
      .from("panel_product_period")
      .select(
        "product_id, product_name, valid_orders, valid_units, cancel_pct, released_orders, released_units, coverage_pct, avg_income, ad_cost, ad_cost_per_unit, net_after_ads, est_total",
      )
      .eq("store_id", storeId)
      .eq("period_start", start)
      .eq("period_end", end)
      .limit(1000);
    return { data, error: msg(error) };
  },

  // Target milik toko ini, plus yang berlaku umum (store_id kosong). storeId sudah
  // divalidasi sebagai UUID sebelum sampai sini.
  async targets(storeId) {
    const { data, error } = await analytics
      .from("targets")
      .select(
        "id, store_id, product_id, kind, target, effective_from, note, updated_by, updated_at",
      )
      .or(`store_id.eq.${storeId},store_id.is.null`)
      .order("effective_from", { ascending: false })
      .limit(500);
    return { data, error: msg(error) };
  },

  async findTarget(storeId, kind, effectiveFrom) {
    const { data, error } = await analytics
      .from("targets")
      .select("id, target, note")
      .eq("store_id", storeId)
      .eq("kind", kind)
      .is("product_id", null)
      .eq("effective_from", effectiveFrom)
      .maybeSingle();
    if (error) return { row: null, error: error.message };
    return {
      row: data
        ? {
            id: Number(data.id),
            target: Number(data.target),
            note: (data.note as string | null) ?? null,
          }
        : null,
      error: null,
    };
  },

  async insertTarget(row) {
    const { error } = await analytics.from("targets").insert(row);
    return { error: msg(error) };
  },

  async updateTarget(id, patch) {
    const { error } = await analytics
      .from("targets")
      .update(patch)
      .eq("id", id);
    return { error: msg(error) };
  },

  now: () => Date.now(),
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handlePanel(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
    start: sp.get("start"),
    end: sp.get("end"),
  });
  return NextResponse.json(json, { status });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const { status, json } = await handleSetTarget(
    deps,
    getAdminFromRequest(req),
    body,
  );
  return NextResponse.json(json, { status });
}
