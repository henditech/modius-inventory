// app/api/analytics/upload/route.ts
// Menyambungkan penangan upload (lib/analytics/uploadHandler.ts) ke Supabase dan cookie sesi.
// Identitas admin HANYA dari cookie bertanda tangan, bukan dari kiriman browser.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import { handleUpload, type UploadDeps } from "@/lib/analytics/uploadHandler";

const analytics = supabaseAdmin.schema("analytics");

const deps: UploadDeps = {
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

  async upsert(table, rows, onConflict) {
    const { error } = await analytics.from(table).upsert(rows, { onConflict });
    return { error: error ? error.message : null };
  },

  // Saldo terakhir sebelum file ini dan saldo awal data sesudahnya, untuk cek kesinambungan.
  async walletNeighbours(storeId, firstTxnAt, lastTxnAt) {
    const prev = await analytics
      .from("wallet_transactions")
      .select("balance_after")
      .eq("store_id", storeId)
      .lt("txn_at", firstTxnAt)
      .order("txn_at", { ascending: false })
      .limit(1);
    const next = await analytics
      .from("wallet_transactions")
      .select("balance_after, amount")
      .eq("store_id", storeId)
      .gt("txn_at", lastTxnAt)
      .order("txn_at", { ascending: true })
      .limit(1);
    const p = prev.data?.[0];
    const n = next.data?.[0];
    return {
      prevBalance: p ? Number(p.balance_after) : null,
      nextStartBalance: n ? Number(n.balance_after) - Number(n.amount) : null,
    };
  },

  async insertUploadLog(entry) {
    const { error } = await analytics.from("uploads").insert(entry);
    return { error: error ? error.message : null };
  },

  now: () => Date.now(),
};

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
  const { status, json } = await handleUpload(
    deps,
    getAdminFromRequest(req),
    body,
  );
  return NextResponse.json(json, { status });
}
