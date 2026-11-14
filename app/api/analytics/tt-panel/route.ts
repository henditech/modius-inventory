// app/api/analytics/tt-panel/route.ts
// Panel target TikTok. Identitas admin hanya dari cookie bertanda tangan.
//   GET  /api/analytics/tt-panel?store=<uuid>[&from=YYYY-MM-DD&to=YYYY-MM-DD]
//        Tanpa from/to: bulan terakhir yang ada pesanannya.
//   POST /api/analytics/tt-panel  { store, kind: "kerja", target, effectiveFrom, note? }
//        Menyimpan target kerja toko (tabel analytics.targets yang sama dengan Shopee).
//        Riwayat dicatat otomatis oleh trigger di database.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import {
  handleSetTtTarget,
  handleTtPanel,
  TT_PANEL_PRODUCT_LIMIT,
  type TtPanelDeps,
} from "@/lib/analytics/ttPanel";

const analytics = supabaseAdmin.schema("analytics");
const msg = (e: { message: string } | null) => (e ? e.message : null);

const deps: TtPanelDeps = {
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

  async coverage(storeId) {
    const { data, error } = await analytics.rpc("tt_coverage", {
      p_store: storeId,
    });
    return { data: data as unknown, error: msg(error) };
  },

  async products(storeId, from, to) {
    const { data, error } = await analytics
      .rpc("tt_panel_products", {
        p_store: storeId,
        p_from: from,
        p_to: to,
      })
      .limit(TT_PANEL_PRODUCT_LIMIT);
    return { data: data as unknown, error: msg(error) };
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
  const { status, json } = await handleTtPanel(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
    from: sp.get("from"),
    to: sp.get("to"),
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
  const { status, json } = await handleSetTtTarget(
    deps,
    getAdminFromRequest(req),
    body,
  );
  return NextResponse.json(json, { status });
}
