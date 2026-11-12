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

  // Hanya untuk rincian iklan otomatis: biaya Iklan Produk Otomatis di file iklan utama
  // periode yang sama persis. null = file iklan utama periode itu belum diupload.
  async adsAutoCompanion(storeId, start, end) {
    const { data, error } = await analytics
      .from("ads_report")
      .select("product_code, cost")
      .eq("store_id", storeId)
      .eq("period_start", start)
      .eq("period_end", end);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return { reportCost: null };
    const reportCost = data
      .filter((r) => r.product_code === "-")
      .reduce((a, r) => a + Number(r.cost ?? 0), 0);
    return { reportCost };
  },

  // TikTok: berapa dari nomor pesanan sampel yang sudah tercatat di toko LAIN, dan toko mana.
  async ttIdsInOtherStores(kind, storeId, ids) {
    const hit = new Set<string>();
    const otherStores = new Set<string>();
    if (kind === "tt_orders") {
      const { data, error } = await analytics
        .from("tt_orders")
        .select("order_id, store_id")
        .in("order_id", ids)
        .neq("store_id", storeId)
        .limit(1000);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as {
        order_id: string;
        store_id: string;
      }[]) {
        hit.add(String(r.order_id));
        otherStores.add(String(r.store_id));
      }
    } else {
      const { data, error } = await analytics
        .from("tt_income_lines")
        .select("entry_id, store_id")
        .in("entry_id", ids)
        .neq("store_id", storeId)
        .limit(1000);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as {
        entry_id: string;
        store_id: string;
      }[]) {
        hit.add(String(r.entry_id));
        otherStores.add(String(r.store_id));
      }
    }
    let storeCodes: string[] = [];
    if (otherStores.size > 0) {
      const { data } = await supabaseAdmin
        .from("stores")
        .select("code")
        .in("id", [...otherStores]);
      storeCodes = ((data ?? []) as { code: string }[]).map((s) => s.code);
    }
    return { count: hit.size, storeCodes };
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
