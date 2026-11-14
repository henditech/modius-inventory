// lib/analytics/validate.ts
// Dipakai SERVER untuk memeriksa baris kiriman browser. Browser tidak dipercaya:
// hanya kolom yang tercantum yang diteruskan, tipenya diperiksa, dan store_id selalu
// diisi oleh server (nilai store_id dari browser diabaikan).

export type UploadKind =
  | "orders"
  | "income"
  | "wallet"
  | "ads"
  | "ads_auto"
  | "tt_orders"
  | "tt_income"
  | "tt_wallet"
  | "tt_ads"
  | "tt_ads_campaign";
export const UPLOAD_KINDS: UploadKind[] = [
  "orders",
  "income",
  "wallet",
  "ads",
  "ads_auto",
  "tt_orders",
  "tt_income",
  "tt_wallet",
  "tt_ads",
  "tt_ads_campaign",
];
export const MAX_ROWS_PER_REQUEST = 1000;

// Tiap jenis file hanya boleh masuk ke toko di marketplace-nya.
export type Marketplace = "shopee" | "tiktok";
export const MARKETPLACE_OF: Record<UploadKind, Marketplace> = {
  orders: "shopee",
  income: "shopee",
  wallet: "shopee",
  ads: "shopee",
  ads_auto: "shopee",
  tt_orders: "tiktok",
  tt_income: "tiktok",
  tt_wallet: "tiktok",
  tt_ads: "tiktok",
  tt_ads_campaign: "tiktok",
};
export const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  shopee: "Shopee",
  tiktok: "TikTok",
};

// "json" = objek berisi angka saja (mis. rincian biaya TikTok yang jenisnya bisa bertambah).
type FieldType = "text" | "num" | "int" | "date" | "ts" | "json";
type Spec = { f: string; t: FieldType; req?: boolean };

const req = (t: FieldType, ...fs: string[]): Spec[] =>
  fs.map((f) => ({ f, t, req: true }));
const opt = (t: FieldType, ...fs: string[]): Spec[] =>
  fs.map((f) => ({ f, t }));

export type TableConfig = {
  table: string;
  onConflict: string; // kolom batas unik di database (harus persis sama)
  key: string[]; // kolom kunci, untuk membuang baris kembar dalam satu kiriman
  spec: Spec[];
};

export const TABLES: Record<UploadKind, TableConfig> = {
  orders: {
    table: "orders",
    onConflict: "store_id,order_no,product_name,sku_ref,variation",
    key: ["order_no", "product_name", "sku_ref", "variation"],
    spec: [
      ...req(
        "text",
        "order_no",
        "sku_ref",
        "variation",
        "status",
        "product_name",
      ),
      ...opt(
        "text",
        "cancel_reason",
        "return_status",
        "tracking_no",
        "shipping_option",
        "payment_method",
        "sku_parent",
      ),
      ...opt(
        "num",
        "list_price",
        "unit_price",
        "subtotal",
        "seller_voucher",
        "shopee_voucher",
        "total_paid",
      ),
      ...req("int", "qty", "returned_qty"),
      ...req("ts", "ordered_at"),
      ...opt("ts", "paid_at", "completed_at"),
    ],
  },
  income: {
    table: "income_lines",
    onConflict: "store_id,order_no,line_no",
    key: ["order_no", "line_no"],
    spec: [
      ...req("text", "order_no", "product_id", "product_name"),
      ...req("int", "line_no"),
      ...opt("date", "created_on", "released_on"),
      ...req(
        "num",
        "income",
        "price",
        "refund",
        "shipping_buyer",
        "shipping_paid",
        "shipping_courier_discount",
        "shipping_shopee",
        "shipping_return",
        "return_to_seller_fee",
        "shipping_refund",
        "seller_voucher",
        "seller_cofund",
        "coin_cashback",
        "shopee_discount",
        "fee_admin",
        "fee_process",
        "fee_xtra",
        "fee_transaction",
        "fee_promo_xtra",
        "fee_campaign",
        "fee_affiliate",
        "auto_topup",
        "fee_premium",
        "fee_fbs",
        "tax_pph22",
      ),
    ],
  },
  wallet: {
    table: "wallet_transactions",
    onConflict: "store_id,txn_at,txn_type,order_no,amount,balance_after",
    key: ["txn_at", "txn_type", "order_no", "amount", "balance_after"],
    spec: [
      ...req("ts", "txn_at"),
      ...req("text", "txn_type", "order_no"),
      ...opt("text", "description", "status"),
      ...req("num", "amount", "balance_after"),
    ],
  },
  ads: {
    table: "ads_report",
    onConflict: "store_id,period_start,period_end,product_code,ad_name",
    key: ["period_start", "period_end", "product_code", "ad_name"],
    spec: [
      ...req("date", "period_start", "period_end"),
      ...req("text", "product_code", "ad_name"),
      ...opt("text", "status", "bidding_mode"),
      ...opt("date", "started_on"),
      ...opt(
        "int",
        "impressions",
        "clicks",
        "add_to_cart",
        "conversions",
        "units_sold",
      ),
      ...opt("num", "gmv", "cost"),
    ],
  },
  ads_auto: {
    table: "ads_auto_detail",
    onConflict: "store_id,period_start,period_end,product_code",
    key: ["period_start", "period_end", "product_code"],
    spec: [
      ...req("date", "period_start", "period_end"),
      ...req("text", "product_code"),
      ...opt("text", "product_name"),
      ...opt(
        "int",
        "impressions",
        "clicks",
        "conversions",
        "conversions_direct",
        "units_sold",
        "units_direct",
      ),
      ...opt("num", "gmv", "gmv_direct", "cost"),
    ],
  },

  // ------------------------------------------------------------ TikTok (11_tiktok_schema.sql)
  // has_tracking dan is_cod di tt_orders dihitung database: sengaja tidak ada di sini.
  tt_orders: {
    table: "tt_orders",
    onConflict: "store_id,order_id,sku_id",
    key: ["order_id", "sku_id"],
    spec: [
      ...req("text", "order_id", "sku_id", "product_name", "status"),
      ...opt(
        "text",
        "seller_sku",
        "variation",
        "substatus",
        "cancel_type",
        "cancel_by",
        "cancel_reason",
        "tracking_id",
        "delivery_option",
        "shipping_provider",
        "payment_method",
        "category",
        "package_id",
        "purchase_channel",
        "order_channel",
        "creator_handle",
      ),
      ...req("int", "qty", "returned_qty"),
      ...opt(
        "num",
        "list_price",
        "subtotal_before",
        "platform_discount",
        "seller_discount",
        "subtotal_after",
        "shipping_fee_original",
        "shipping_platform_discount",
        "shipping_seller_discount",
        "refund_amount",
        "order_amount",
      ),
      ...req("ts", "created_at"),
      ...opt(
        "ts",
        "paid_at",
        "rts_at",
        "shipped_at",
        "delivered_at",
        "cancelled_at",
      ),
    ],
  },
  tt_income: {
    table: "tt_income_lines",
    onConflict: "store_id,entry_id,paid_on",
    key: ["entry_id", "paid_on"],
    spec: [
      ...req("text", "entry_id", "txn_type"),
      ...opt("text", "related_order_id", "source"),
      ...opt("date", "ordered_on"),
      ...req("date", "paid_on"),
      ...req(
        "num",
        "settlement",
        "revenue",
        "subtotal_after",
        "subtotal_before",
        "seller_discount",
        "refund_after",
        "refund_before",
        "refund_seller_discount",
        "total_fee",
        "fee_commission",
        "fee_payment",
        "shipping_net",
        "fee_affiliate",
        "fee_affiliate_ads",
        "fee_dynamic",
        "fee_growth_xtra",
        "fee_processing",
        "tax_pph22",
        "fee_gmv_max",
        "adjustment",
        "buyer_paid",
        "buyer_refund",
        "platform_discount",
        "platform_discount_refund",
        "seller_voucher",
        "seller_voucher_refund",
      ),
      ...req("json", "fee_other", "shipping_detail"),
    ],
  },
  tt_wallet: {
    table: "tt_wallet",
    onConflict: "store_id,ref_id",
    key: ["ref_id"],
    spec: [
      ...req("text", "ref_id", "txn_type"),
      ...req("date", "requested_on"),
      ...req("num", "amount"),
      ...opt("text", "status"),
      ...opt("date", "done_on"),
    ],
  },
  tt_ads: {
    table: "tt_ads_daily",
    onConflict: "store_id,day",
    key: ["day"],
    spec: [
      ...req("date", "day"),
      ...req("num", "cost", "gross_revenue"),
      ...req("int", "sku_orders"),
      ...opt("num", "roi"),
    ],
  },
  // 18_tiktok_iklan_kampanye.sql. Mengisi tt_ads_daily dilakukan database (19_tiktok_iklan_sinkron.sql).
  tt_ads_campaign: {
    table: "tt_ads_campaign_daily",
    onConflict: "store_id,campaign_id,day",
    key: ["campaign_id", "day"],
    spec: [
      ...req("text", "campaign_id", "campaign_name"),
      ...req("date", "day"),
      ...req(
        "num",
        "cost",
        "net_cost",
        "affiliate_cost",
        "gross_revenue",
        "voucher_cost",
        "voucher_revenue",
      ),
      ...req("int", "sku_orders"),
      ...opt("num", "roi", "daily_budget"),
      ...opt("text", "roi_protection"),
    ],
  },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const INT_MAX = 2147483647;

export const isDateStr = (v: unknown): v is string =>
  typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));

function checkValue(
  t: FieldType,
  v: unknown,
  required: boolean,
): string | null {
  switch (t) {
    case "text":
      if (typeof v !== "string") return "harus teks";
      if (v.length > 1000) return "terlalu panjang";
      if (required && v.trim() === "") return "tidak boleh kosong";
      return null;
    case "num":
      return typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e15
        ? null
        : "harus angka";
    case "int":
      return typeof v === "number" &&
        Number.isInteger(v) &&
        Math.abs(v) <= INT_MAX
        ? null
        : "harus bilangan bulat";
    case "date":
      return isDateStr(v) ? null : "harus tanggal YYYY-MM-DD";
    case "ts":
      return typeof v === "string" &&
        TS_RE.test(v) &&
        !Number.isNaN(Date.parse(v))
        ? null
        : "harus waktu ISO";
    case "json": {
      if (typeof v !== "object" || v === null || Array.isArray(v))
        return "harus objek";
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length > 100) return "isinya terlalu banyak";
      for (const [k, x] of entries) {
        if (k.length > 200) return "nama isi terlalu panjang";
        if (typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) >= 1e15)
          return "hanya boleh berisi angka";
      }
      return null;
    }
  }
}

export function sanitizeRows(
  kind: UploadKind,
  rows: unknown,
  storeId: string,
):
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: string } {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Tidak ada baris untuk disimpan." };
  }
  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return {
      ok: false,
      error: `Terlalu banyak baris dalam satu kiriman (maksimal ${MAX_ROWS_PER_REQUEST}).`,
    };
  }
  const cfg = TABLES[kind];
  const byKey = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: `Baris ${i + 1} bukan data yang valid.` };
    }
    const src = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const s of cfg.spec) {
      const v = src[s.f];
      if (v === null || v === undefined) {
        if (s.req)
          return {
            ok: false,
            error: `Baris ${i + 1}: kolom '${s.f}' wajib diisi.`,
          };
        out[s.f] = null;
        continue;
      }
      const problem = checkValue(s.t, v, !!s.req);
      if (problem)
        return {
          ok: false,
          error: `Baris ${i + 1}: kolom '${s.f}' ${problem}.`,
        };
      out[s.f] = v;
    }
    out.store_id = storeId; // selalu dari server
    byKey.set(JSON.stringify(cfg.key.map((k) => out[k])), out);
  }
  return { ok: true, rows: [...byKey.values()] };
}

// ------------------------------------------------------------- identitas toko

export type StoreIdentity = {
  code: string;
  marketplace_username: string | null;
  marketplace_shop_id: string | null;
};

export function checkStoreIdentity(
  kind: UploadKind,
  store: StoreIdentity,
  file: { username?: string; shopId?: string },
): { error?: string; warnings: string[] } {
  const warnings: string[] = [];
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  if (kind === "orders") {
    warnings.push(
      "File pesanan tidak memuat identitas toko, jadi tidak bisa dicek otomatis. Pastikan toko yang dipilih benar.",
    );
    return { warnings };
  }

  // File TikTok (pesanan, income, Campaign overview, Product campaign) tidak memuat identitas toko sama sekali.
  if (MARKETPLACE_OF[kind] === "tiktok") {
    warnings.push(
      "File TikTok tidak memuat identitas toko, jadi tidak bisa dicek otomatis. Pastikan toko yang dipilih benar.",
    );
    return { warnings };
  }

  if (!norm(file.username)) {
    warnings.push(
      "File ini tidak mencantumkan username toko, jadi tidak bisa dicek otomatis.",
    );
  } else if (!norm(store.marketplace_username)) {
    warnings.push(
      `Username toko ${store.code} belum tersimpan di sistem, jadi file tidak bisa dicocokkan (di file: ${file.username}).`,
    );
  } else if (norm(file.username) !== norm(store.marketplace_username)) {
    return {
      error: `File ini milik toko "${file.username}", tetapi toko yang dipilih (${store.code}) terdaftar sebagai "${store.marketplace_username}". Periksa lagi toko yang dipilih.`,
      warnings,
    };
  }

  if (
    norm(file.shopId) &&
    norm(store.marketplace_shop_id) &&
    norm(file.shopId) !== norm(store.marketplace_shop_id)
  ) {
    return {
      error: `ID Toko di file (${file.shopId}) tidak sama dengan ID Toko ${store.code} (${store.marketplace_shop_id}).`,
      warnings,
    };
  }
  return { warnings };
}
