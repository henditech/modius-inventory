// app/api/analytics/tt-saldo/route.ts
// Menyambungkan penangan tab Saldo TikTok (lib/analytics/ttSaldo.ts) ke Supabase dan cookie
// sesi. Identitas admin HANYA dari cookie bertanda tangan.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import {
  handleTtSaldo,
  TT_SALDO_LIST_LIMIT,
  type TtSaldoDeps,
} from "@/lib/analytics/ttSaldo";

const analytics = supabaseAdmin.schema("analytics");

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await analytics.rpc(fn, args);
  return {
    data: data as unknown,
    error: error ? (error.message as string) : null,
  };
}

const deps: TtSaldoDeps = {
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
    rpc("tt_wallet_summary", { p_store: storeId, p_from: from, p_to: to }),
  // Satu baris per penarikan, terbaru dulu. Batasnya sengaja dibuat eksplisit; kalau tercapai,
  // handler memberi peringatan ke pengguna. Nomor rekening memang tidak disimpan di tabel ini.
  async withdrawals(storeId, from, to) {
    const { data, error } = await analytics
      .from("tt_wallet")
      .select("ref_id, requested_on, amount, status, done_on")
      .eq("store_id", storeId)
      .eq("txn_type", "Withdrawal")
      .gte("requested_on", from)
      .lte("requested_on", to)
      .order("requested_on", { ascending: false })
      .order("id", { ascending: false })
      .range(0, TT_SALDO_LIST_LIMIT - 1);
    return {
      data: data as unknown,
      error: error ? (error.message as string) : null,
    };
  },
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const { status, json } = await handleTtSaldo(deps, getAdminFromRequest(req), {
    store: sp.get("store"),
    from: sp.get("from"),
    to: sp.get("to"),
  });
  return NextResponse.json(json, { status });
}
