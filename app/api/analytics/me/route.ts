// app/api/analytics/me/route.ts
// Siapa yang login (dari cookie bertanda tangan), toko yang dia kelola, dan upload terakhir
// per jenis file untuk tiap toko. Dipakai halaman Analytics.
//
// Tanpa parameter: hanya toko Shopee (dipakai tab Penghasilan, Saldo, Panel, Iklan, Pesanan,
// Harga Shopee). ?scope=upload: toko Shopee dan TikTok (halaman Upload). ?scope=tiktok: hanya
// toko TikTok (tab TikTok).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminFromRequest } from "@/lib/session";
import {
  latestPerStoreKind,
  type UploadLogRow,
} from "@/lib/analytics/uploadHandler";
import { UPLOAD_KINDS } from "@/lib/analytics/validate";

type StoreRow = {
  id: string;
  name: string;
  code: string;
  marketplace: string;
  marketplace_username: string | null;
};

export async function GET(req: Request) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Sesi tidak valid. Masuk lagi lewat halaman login." },
      { status: 401 },
    );
  }

  const scope = new URL(req.url).searchParams.get("scope");
  const marketplaces =
    scope === "upload"
      ? ["shopee", "tiktok"]
      : scope === "tiktok"
        ? ["tiktok"]
        : ["shopee"];

  const { data: stores, error } = await supabaseAdmin
    .from("stores")
    .select("id, name, code, marketplace, marketplace_username")
    .eq("managed_by", admin)
    .in("marketplace", marketplaces)
    .order("marketplace")
    .order("code");
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Gagal memuat daftar toko." },
      { status: 500 },
    );
  }

  const list = (stores ?? []) as StoreRow[];
  const ids = list.map((s) => s.id);
  let logs: UploadLogRow[] = [];
  if (ids.length > 0) {
    const res = await supabaseAdmin
      .schema("analytics")
      .from("uploads")
      .select(
        "store_id, file_type, file_name, period_start, period_end, row_count, uploaded_by, uploaded_at",
      )
      .in("store_id", ids)
      .order("uploaded_at", { ascending: false })
      .limit(500);
    logs = (res.data ?? []) as UploadLogRow[];
  }
  const latest = latestPerStoreKind(logs);

  return NextResponse.json({
    ok: true,
    admin,
    stores: list.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      marketplace: s.marketplace,
      username: s.marketplace_username,
      last: Object.fromEntries(
        UPLOAD_KINDS.map((k) => [k, latest.get(`${s.id}|${k}`) ?? null]),
      ),
    })),
  });
}
