// lib/analytics/validate.ts
// Dipakai SERVER untuk memeriksa baris kiriman browser. Browser tidak dipercaya:
// hanya kolom yang tercantum yang diteruskan, tipenya diperiksa, dan store_id selalu
// diisi oleh server (nilai store_id dari browser diabaikan).

export type UploadKind = "orders" | "income" | "wallet" | "ads";
export const UPLOAD_KINDS: UploadKind[] = ["orders", "income", "wallet", "ads"];
export const MAX_ROWS_PER_REQUEST = 1000;

type FieldType = "text" | "num" | "int" | "date" | "ts";
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
