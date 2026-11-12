// lib/analytics/parseTikTok.ts
// Pembaca file TikTok Shop: Semua pesanan, income, dan Campaign overview. Fungsi murni tanpa
// dependensi (pola sama dengan parse.ts): menerima baris mentah (array 2 dimensi) dan
// mengembalikan baris bersih yang siap diunggah. Dijalankan DI BROWSER sebelum apa pun dikirim.
//
// Aturan privasi: hanya kolom yang tercantum di bawah yang dibaca. Username pembeli, nama
// penerima, telepon, alamat (termasuk provinsi dan kota), catatan pembeli, dan nomor rekening
// bank TIDAK pernah disentuh.
//
// Temuan format (contoh Oktober 2026):
//   - Semua pesanan: baris 1 nama kolom (Inggris), baris 2 penjelasan kolom, data dari baris 3.
//     Angka berupa digit polos. Waktu "dd/mm/yyyy hh:mm:ss" (WIB).
//   - income: sheet "Detail pesanan" (satu baris per pesanan atau penyesuaian), "Laporan"
//     (total periode), "Riwayat penarikan" (dana harian, penarikan, potongan iklan). Hampir semua
//     sel berupa teks; tanggal "yyyy/mm/dd". Periode berdasarkan tanggal pembayaran.
//   - Campaign overview: baris data per hari + satu baris total di akhir (kolom tanggal "-").
//   - Beberapa file TikTok mencatat ukuran sheet salah ("A1"). Pembaca file (readFile.ts) harus
//     menghitung ulang rentang sheet dari sel yang ada sebelum memanggil fungsi di sini.
import { ParseError, type ParsedFile, type Period, type Rows } from "./parse";

type Cell = unknown;

// ---------------------------------------------------------------- utilitas dasar

const str = (v: Cell): string => (v == null ? "" : String(v).trim());

// Angka dengan titik sebagai desimal ("-111000", "7.69"). Kosong, "-", "/" = tidak ada.
function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (s === "" || s === "-" || s === "/") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const int = (n: number | null): number | null =>
  n == null ? null : Math.round(n);

// ID TikTok 18 digit melebihi batas angka aman JavaScript. Kalau sel terbaca sebagai angka,
// digit terakhirnya sudah rusak: tolak, jangan diam-diam disimpan salah.
function idText(v: Cell, what: string): string {
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) {
      throw new ParseError(
        `${what} terbaca sebagai angka dan bisa terpotong. Pakai file langsung dari TikTok, jangan disimpan ulang di Excel.`,
      );
    }
    return String(v);
  }
  return str(v);
}

// "31/10/2026 22:27:41" (WIB) -> "2026-10-31T22:27:41+07:00"
function wibDmy(v: Cell): string | null {
  const m = str(v).match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  return m
    ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+07:00`
    : null;
}

// "2026/10/30", "2026-10-30" atau "2026-10-30 00:00:00" -> "2026-10-30"
function ymd(v: Cell): string | null {
  const m = str(v).match(/^(\d{4})[/-](\d{2})[/-](\d{2})(?:[ T].*)?$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Tanggal bisa berupa teks atau nomor seri Excel (hari sejak 1899-12-30).
function dayOf(v: Cell): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  return ymd(v);
}

function findHeaderRow(rows: Rows, must: string[], scan = 15): number {
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const names = new Set(rows[i].map(str));
    if (must.every((m) => names.has(m))) return i;
  }
  return -1;
}

function headerIndex(row: Cell[]): Map<string, number> {
  const idx = new Map<string, number>();
  row.forEach((c, i) => {
    const k = str(c);
    if (k && !idx.has(k)) idx.set(k, i);
  });
  return idx;
}

function colStarting(idx: Map<string, number>, prefix: string): number | null {
  for (const [k, i] of idx) if (k.startsWith(prefix)) return i;
  return null;
}

function minMax(dates: (string | null)[]): Period | null {
  const d = dates.filter((x): x is string => !!x).sort();
  return d.length ? { start: d[0], end: d[d.length - 1] } : null;
}

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

// ---------------------------------------------------------------- PESANAN

export type TtOrderRow = {
  order_id: string;
  sku_id: string;
  seller_sku: string | null;
  product_name: string;
  variation: string | null;
  status: string;
  substatus: string | null;
  cancel_type: string | null;
  cancel_by: string | null;
  cancel_reason: string | null;
  qty: number;
  returned_qty: number;
  list_price: number | null;
  subtotal_before: number | null;
  platform_discount: number | null;
  seller_discount: number | null;
  subtotal_after: number | null;
  shipping_fee_original: number | null;
  shipping_platform_discount: number | null;
  shipping_seller_discount: number | null;
  refund_amount: number | null;
  order_amount: number | null;
  created_at: string;
  paid_at: string | null;
  rts_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  tracking_id: string | null;
  delivery_option: string | null;
  shipping_provider: string | null;
  payment_method: string | null;
  category: string | null;
  package_id: string | null;
  purchase_channel: string | null;
  order_channel: string | null;
  creator_handle: string | null;
};

const KNOWN_ORDER_STATUS = new Set(["Selesai", "Dibatalkan", "Dikirim"]);

export function parseTtOrders(rows: Rows): ParsedFile<TtOrderRow> {
  const h = findHeaderRow(rows, [
    "Order ID",
    "Order Status",
    "Product Name",
    "SKU ID",
  ]);
  if (h < 0) {
    throw new ParseError(
      "Ini bukan file 'Semua pesanan' TikTok Shop: kolom 'Order ID', 'Order Status', 'Product Name', dan 'SKU ID' tidak ditemukan.",
    );
  }
  const idx = headerIndex(rows[h]);
  const get = (r: Cell[], name: string): Cell => {
    const i = idx.get(name);
    return i == null ? "" : r[i];
  };
  const text = (r: Cell[], name: string): string | null =>
    str(get(r, name)) || null;
  const n = (r: Cell[], name: string) => num(get(r, name));

  const out: TtOrderRow[] = [];
  const seen = new Set<string>();
  const unknownStatus = new Map<string, number>();
  const warnings: string[] = [];
  let duplicates = 0;
  let badRows = 0;

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const order_id = idText(get(r, "Order ID"), "ID pesanan");
    if (!order_id) continue;
    if (!/^\d+$/.test(order_id)) {
      if (i === h + 1) continue; // baris penjelasan kolom ("Platform unique order ID.")
      badRows++;
      continue;
    }

    const created_at = wibDmy(get(r, "Created Time"));
    const product_name = str(get(r, "Product Name"));
    const status = str(get(r, "Order Status"));
    if (!created_at || !product_name || !status) {
      badRows++;
      continue;
    }
    const sku_id = str(get(r, "SKU ID")) || "-";

    const key = `${order_id}\u0000${sku_id}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    if (!KNOWN_ORDER_STATUS.has(status))
      unknownStatus.set(status, (unknownStatus.get(status) ?? 0) + 1);

    out.push({
      order_id,
      sku_id,
      seller_sku: text(r, "Seller SKU"),
      product_name,
      variation: text(r, "Variation"),
      status,
      substatus: text(r, "Order Substatus"),
      cancel_type: text(r, "Cancelation/Return Type"),
      cancel_by: text(r, "Cancel By"),
      cancel_reason: text(r, "Cancel Reason"),
      qty: int(n(r, "Quantity")) ?? 1,
      returned_qty: int(n(r, "Sku Quantity of return")) ?? 0,
      list_price: n(r, "SKU Unit Original Price"),
      subtotal_before: n(r, "SKU Subtotal Before Discount"),
      platform_discount: n(r, "SKU Platform Discount"),
      seller_discount: n(r, "SKU Seller Discount"),
      subtotal_after: n(r, "SKU Subtotal After Discount"),
      shipping_fee_original: n(r, "Original Shipping Fee"),
      shipping_platform_discount: n(r, "Shipping Fee Platform Discount"),
      shipping_seller_discount: n(r, "Shipping Fee Seller Discount"),
      refund_amount: n(r, "Order Refund Amount"),
      order_amount: n(r, "Order Amount"),
      created_at,
      paid_at: wibDmy(get(r, "Paid Time")),
      rts_at: wibDmy(get(r, "RTS Time")),
      shipped_at: wibDmy(get(r, "Shipped Time")),
      delivered_at: wibDmy(get(r, "Delivered Time")),
      cancelled_at: wibDmy(get(r, "Cancelled Time")),
      tracking_id: text(r, "Tracking ID"),
      delivery_option: text(r, "Delivery Option"),
      shipping_provider: text(r, "Shipping Provider Name"),
      payment_method: text(r, "Payment Method"),
      category: text(r, "Product Category"),
      package_id: text(r, "Package ID"),
      purchase_channel: text(r, "Purchase Channel"),
      order_channel: text(r, "Order Channel"),
      creator_handle: text(r, "Creator Handle"),
    });
  }

  if (badRows > 0)
    warnings.push(
      `${badRows} baris dilewati karena ID pesanan, status, nama produk, atau waktu pesanan tidak terbaca.`,
    );
  if (duplicates > 0)
    warnings.push(
      `${duplicates} baris kembar (pesanan dan SKU sama) dilewati.`,
    );
  if (unknownStatus.size > 0) {
    const list = [...unknownStatus]
      .map(([s, c]) => `${s} (${c} baris)`)
      .join(", ");
    warnings.push(
      `Status yang belum pernah diuji: ${list}. Angka untuk status ini perlu dicek manual.`,
    );
  }
  if (out.length === 0)
    throw new ParseError(
      "File pesanan ini tidak berisi baris pesanan yang bisa dibaca.",
    );

  const orders = new Map<string, string>();
  for (const o of out) orders.set(o.order_id, o.status);
  return {
    rows: out,
    store: {}, // file pesanan TikTok tidak memuat identitas toko
    period: minMax(out.map((o) => o.created_at.slice(0, 10))),
    warnings,
    info: {
      baris: out.length,
      pesanan: orders.size,
      dibatalkan: [...orders.values()].filter((s) => s === "Dibatalkan").length,
      dengan_resi: out.filter((o) => o.tracking_id).length,
    },
  };
}

// ---------------------------------------------------------------- INCOME (penghasilan + riwayat dana)

export type TtIncomeRow = {
  entry_id: string;
  txn_type: string;
  related_order_id: string | null;
  ordered_on: string | null;
  paid_on: string;
  source: string | null;
  settlement: number;
  revenue: number;
  subtotal_after: number;
  subtotal_before: number;
  seller_discount: number;
  refund_after: number;
  refund_before: number;
  refund_seller_discount: number;
  total_fee: number;
  fee_commission: number;
  fee_payment: number;
  shipping_net: number;
  fee_affiliate: number;
  fee_affiliate_ads: number;
  fee_dynamic: number;
  fee_growth_xtra: number;
  fee_processing: number;
  tax_pph22: number;
  fee_gmv_max: number;
  fee_other: Record<string, number>;
  shipping_detail: Record<string, number>;
  adjustment: number;
  buyer_paid: number;
  buyer_refund: number;
  platform_discount: number;
  platform_discount_refund: number;
  seller_voucher: number;
  seller_voucher_refund: number;
};

export type TtWalletRow = {
  ref_id: string;
  txn_type: string;
  requested_on: string;
  amount: number;
  status: string | null;
  done_on: string | null;
};

export const TT_AD_TXN_TYPE = "Pembayaran GMV untuk Iklan TikTok";
const KNOWN_TXN_TYPES = new Set([
  "Pesanan",
  TT_AD_TXN_TYPE,
  "Penggantian dana oleh platform",
]);

// kolom angka bertipe -> nama kolom di file. Nilai kosong dibaca 0.
type NumField = Exclude<
  keyof TtIncomeRow,
  | "entry_id"
  | "txn_type"
  | "related_order_id"
  | "ordered_on"
  | "paid_on"
  | "source"
  | "fee_other"
  | "shipping_detail"
>;
const INCOME_NUM: [NumField, string][] = [
  ["settlement", "Jumlah penyelesaian pembayaran"],
  ["revenue", "Total Pendapatan"],
  ["subtotal_after", "Subtotal setelah diskon penjual"],
  ["subtotal_before", "Subtotal sebelum diskon"],
  ["seller_discount", "Diskon penjual"],
  ["refund_after", "Total pengembalian dana setelah diskon"],
  ["refund_before", "Total pengembalian dana sebelum diskon"],
  ["refund_seller_discount", "Pengembalian dana diskon penjual"],
  ["total_fee", "Total Biaya"],
  ["fee_commission", "Biaya komisi platform"],
  ["fee_payment", "Biaya Pembayaran"],
  ["shipping_net", "Ongkir"],
  ["fee_affiliate", "Komisi Afiliasi"],
  ["fee_affiliate_ads", "Komisi Iklan Toko afiliasi"],
  ["fee_dynamic", "Komisi dinamis"],
  ["fee_growth_xtra", "Biaya layanan Program Growth Xtra"],
  ["fee_processing", "Biaya pemrosesan pesanan"],
  ["tax_pph22", "PPh Pasal 22 dipungut"],
  ["fee_gmv_max", "Biaya iklan GMV Max"],
  ["adjustment", "Jumlah penyesuaian"],
  ["buyer_paid", "Pembayaran oleh pembeli"],
  ["buyer_refund", "Pengembalian dana pembeli"],
  ["platform_discount", "Diskon platform"],
  ["platform_discount_refund", "Pengembalian dana diskon platform"],
  ["seller_voucher", "Diskon voucher yang ditanggung penjual"],
  [
    "seller_voucher_refund",
    "Pengembalian dana diskon voucher yang ditanggung penjual",
  ],
];

// Kolom biaya di sheet "Detail pesanan" berurutan dari FEE_START sampai FEE_END. Di dalamnya,
// kolom SHIP_START..SHIP_END adalah RINCIAN "Ongkir" (sudah terjumlah di kolom Ongkir), jadi tidak
// ikut dijumlahkan lagi ke total biaya.
const FEE_START = "Biaya komisi platform";
const FEE_END = "Biaya asuransi";
const SHIP_START = "Ongkir yang ditalangi penyedia jasa logistik";
const SHIP_END = "Penggantian biaya asuransi";

function labelValue(rows: Rows, label: string): number | null {
  for (const r of rows) {
    const k = r.findIndex((c) => str(c) === label);
    if (k < 0) continue;
    for (let j = r.length - 1; j > k; j--) {
      const v = num(r[j]);
      if (v != null) return v;
    }
  }
  return null;
}

function labelText(rows: Rows, label: string): string {
  for (const r of rows) {
    const k = r.findIndex((c) => str(c) === label);
    if (k < 0) continue;
    for (let j = r.length - 1; j > k; j--) {
      const v = str(r[j]);
      if (v) return v;
    }
  }
  return "";
}

export function parseTtIncome(book: Record<string, Rows>): {
  income: ParsedFile<TtIncomeRow>;
  wallet: ParsedFile<TtWalletRow>;
} {
  const sheet = book["Detail pesanan"];
  const laporan = book["Laporan"];
  const history = book["Riwayat penarikan"];
  if (!sheet || !laporan || !history) {
    throw new ParseError(
      "Ini bukan file 'income' TikTok Shop: sheet 'Detail pesanan', 'Laporan', dan 'Riwayat penarikan' harus ada.",
    );
  }

  // ------------------------------------------------------------ Detail pesanan
  const h = findHeaderRow(sheet, [
    "ID Pesanan/Penyesuaian",
    "Jenis transaksi",
    "Waktu pembayaran pesanan",
    "Jumlah penyelesaian pembayaran",
  ]);
  if (h < 0)
    throw new ParseError("Header sheet 'Detail pesanan' tidak dikenali.");
  const header = sheet[h];
  const idx = headerIndex(header);
  const get = (r: Cell[], name: string): Cell => {
    const i = idx.get(name);
    return i == null ? "" : r[i];
  };

  const feeStart = idx.get(FEE_START);
  const feeEnd = idx.get(FEE_END);
  const shipStart = idx.get(SHIP_START);
  const shipEnd = idx.get(SHIP_END);
  const anchors: [string, number | undefined][] = [
    [FEE_START, feeStart],
    [FEE_END, feeEnd],
    [SHIP_START, shipStart],
    [SHIP_END, shipEnd],
  ];
  const missingAnchors = anchors.filter(([, i]) => i == null).map(([n]) => n);
  if (missingAnchors.length > 0) {
    throw new ParseError(
      `Susunan kolom biaya di sheet 'Detail pesanan' berubah dari contoh yang diuji: kolom ${missingAnchors.map((n) => `'${n}'`).join(", ")} tidak ditemukan (sheet terbaca ${header.length} kolom). Kirim file ini ke pengembang sebelum diupload.`,
    );
  }
  if (
    feeStart == null ||
    feeEnd == null ||
    shipStart == null ||
    shipEnd == null ||
    feeEnd < feeStart ||
    shipEnd < shipStart ||
    shipStart <= feeStart ||
    shipEnd > feeEnd
  ) {
    throw new ParseError(
      "Susunan kolom biaya di sheet 'Detail pesanan' berubah dari contoh yang diuji: urutan kolom biaya berbeda. Kirim file ini ke pengembang sebelum diupload.",
    );
  }
  for (const [, col] of INCOME_NUM) {
    if (!idx.has(col))
      throw new ParseError(
        `Kolom '${col}' tidak ditemukan di sheet 'Detail pesanan'.`,
      );
  }
  const typedNames = new Set(INCOME_NUM.map(([, c]) => c));

  const out: TtIncomeRow[] = [];
  const seen = new Set<string>();
  const unknownTypes = new Map<string, number>();
  let badRows = 0;
  let duplicates = 0;
  let feeMismatch = 0;
  let settleMismatch = 0;

  for (let i = h + 1; i < sheet.length; i++) {
    const r = sheet[i];
    const entry_id = idText(get(r, "ID Pesanan/Penyesuaian"), "ID pesanan");
    if (!entry_id) continue;
    const txn_type = str(get(r, "Jenis transaksi"));
    const paid_on = ymd(get(r, "Waktu pembayaran pesanan"));
    const settlement = num(get(r, "Jumlah penyelesaian pembayaran"));
    if (!txn_type || !paid_on || settlement == null) {
      badRows++;
      continue;
    }
    const key = `${entry_id}\u0000${paid_on}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    if (!KNOWN_TXN_TYPES.has(txn_type))
      unknownTypes.set(txn_type, (unknownTypes.get(txn_type) ?? 0) + 1);

    const related = idText(get(r, "ID pesanan terkait"), "ID pesanan terkait");
    const row = {
      entry_id,
      txn_type,
      related_order_id: /^\d+$/.test(related) ? related : null,
      ordered_on: ymd(get(r, "Waktu pemesanan")),
      paid_on,
      source: str(get(r, "Sumber pesanan")) || null,
      fee_other: {} as Record<string, number>,
      shipping_detail: {} as Record<string, number>,
    } as TtIncomeRow;
    for (const [field, col] of INCOME_NUM) {
      row[field] = num(get(r, col)) ?? 0;
    }

    // Biaya di luar kolom bertipe -> fee_other; rincian ongkir -> shipping_detail.
    let siblingSum = 0;
    for (let c = feeStart; c <= feeEnd; c++) {
      const name = str(header[c]);
      if (!name) continue;
      const v = num(r[c]) ?? 0;
      const isShipChild = c >= shipStart && c <= shipEnd;
      if (!isShipChild) siblingSum += v;
      if (v === 0 || typedNames.has(name)) continue;
      if (isShipChild) row.shipping_detail[name] = v;
      else row.fee_other[name] = v;
    }
    // Pemeriksaan per baris: biaya = jumlah kolom biaya; penyelesaian = pendapatan + biaya + penyesuaian.
    if (Math.abs(siblingSum - row.total_fee) > 1) feeMismatch++;
    if (
      Math.abs(row.revenue + row.total_fee + row.adjustment - row.settlement) >
      1
    )
      settleMismatch++;
    out.push(row);
  }

  if (badRows > 0) {
    throw new ParseError(
      `${badRows} baris di sheet 'Detail pesanan' tidak punya ID, jenis transaksi, tanggal pembayaran, atau jumlah penyelesaian yang valid.`,
    );
  }
  if (out.length === 0)
    throw new ParseError("Sheet 'Detail pesanan' tidak berisi baris.");

  const warnings: string[] = [];
  if (duplicates > 0) warnings.push(`${duplicates} baris kembar dilewati.`);
  if (unknownTypes.size > 0) {
    const list = [...unknownTypes].map(([t, c]) => `${t} (${c})`).join(", ");
    warnings.push(
      `Jenis transaksi yang belum pernah diuji: ${list}. Cek angkanya manual.`,
    );
  }
  if (feeMismatch > 0)
    warnings.push(
      `${feeMismatch} baris: jumlah kolom biaya tidak sama dengan 'Total Biaya'. Mungkin TikTok menambah jenis biaya baru.`,
    );
  if (settleMismatch > 0)
    warnings.push(
      `${settleMismatch} baris: jumlah penyelesaian tidak sama dengan pendapatan + biaya + penyesuaian.`,
    );

  // ------------------------------------------------------------ Laporan (total periode)
  const sum = (f: NumField) => out.reduce((a, o) => a + o[f], 0);
  const checks: [string, NumField][] = [
    ["Jumlah penyelesaian pembayaran", "settlement"],
    ["Total Pendapatan", "revenue"],
    ["Total Biaya", "total_fee"],
  ];
  let laporanChecked = 0;
  for (const [label, field] of checks) {
    const expected = labelValue(laporan, label);
    if (expected == null) continue;
    laporanChecked++;
    const got = sum(field);
    if (Math.abs(expected - got) > 1) {
      throw new ParseError(
        `'${label}' di baris data (${rupiah(got)}) tidak sama dengan sheet Laporan (${rupiah(expected)}). File mungkin terpotong atau rusak.`,
      );
    }
  }
  if (laporanChecked === 0)
    warnings.push(
      "Total di sheet Laporan tidak ditemukan, jadi jumlah tidak bisa dicocokkan.",
    );

  const per = labelText(laporan, "Periode").match(
    /(\d{4}[/-]\d{2}[/-]\d{2})\s*-\s*(\d{4}[/-]\d{2}[/-]\d{2})/,
  );
  const start = per ? ymd(per[1]) : null;
  const end = per ? ymd(per[2]) : null;
  const period: Period | null =
    start && end ? { start, end } : minMax(out.map((o) => o.paid_on));

  const adRows = out.filter((o) => o.txn_type === TT_AD_TXN_TYPE);
  const adSum = adRows.reduce((a, o) => a + o.settlement, 0);
  const payoutSum = out
    .filter((o) => o.txn_type !== TT_AD_TXN_TYPE)
    .reduce((a, o) => a + o.settlement, 0);

  const income: ParsedFile<TtIncomeRow> = {
    rows: out,
    store: {}, // file income tidak memuat identitas toko
    period,
    warnings,
    info: {
      baris: out.length,
      pesanan: out.filter((o) => o.txn_type === "Pesanan").length,
      dana_bersih: Math.round(sum("settlement")),
      biaya_iklan: Math.round(adSum),
    },
  };

  // ------------------------------------------------------------ Riwayat penarikan
  const wh = findHeaderRow(history, [
    "Jenis transaksi",
    "ID referensi",
    "Waktu permintaan",
    "Total",
  ]);
  if (wh < 0)
    throw new ParseError("Header sheet 'Riwayat penarikan' tidak dikenali.");
  const widx = headerIndex(history[wh]);
  const wget = (r: Cell[], name: string): Cell => {
    const i = widx.get(name);
    return i == null ? "" : r[i];
  };
  const wallet: TtWalletRow[] = [];
  const wseen = new Set<string>();
  let wBad = 0;
  let wDup = 0;
  // Kolom "Rekening bank" sengaja tidak dibaca.
  for (let i = wh + 1; i < history.length; i++) {
    const r = history[i];
    const ref_id = idText(wget(r, "ID referensi"), "ID referensi");
    if (!ref_id) continue;
    const txn_type = str(wget(r, "Jenis transaksi"));
    const requested_on = ymd(wget(r, "Waktu permintaan"));
    const amount = num(wget(r, "Total"));
    if (!txn_type || !requested_on || amount == null) {
      wBad++;
      continue;
    }
    if (wseen.has(ref_id)) {
      wDup++;
      continue;
    }
    wseen.add(ref_id);
    wallet.push({
      ref_id,
      txn_type,
      requested_on,
      amount,
      status: str(wget(r, "Status")) || null,
      done_on: ymd(wget(r, "Waktu keberhasilan")),
    });
  }
  if (wBad > 0)
    throw new ParseError(
      `${wBad} baris di sheet 'Riwayat penarikan' tidak punya ID, jenis, tanggal, atau jumlah yang valid.`,
    );
  if (wallet.length === 0)
    throw new ParseError("Sheet 'Riwayat penarikan' tidak berisi baris.");

  const wWarn: string[] = [];
  if (wDup > 0) wWarn.push(`${wDup} baris kembar dilewati.`);
  const sumType = (t: string) =>
    wallet.filter((w) => w.txn_type === t).reduce((a, w) => a + w.amount, 0);
  const earnings = sumType("Earnings");
  const deduction = sumType("GMV Pay Deduction");
  if (Math.abs(earnings - payoutSum) > 1)
    wWarn.push(
      `Dana masuk (Earnings) di Riwayat penarikan (${rupiah(earnings)}) tidak sama dengan jumlah penyelesaian di Detail pesanan (${rupiah(payoutSum)}).`,
    );
  if (Math.abs(deduction - adSum) > 1)
    wWarn.push(
      `Potongan iklan (GMV Pay) di Riwayat penarikan (${rupiah(deduction)}) tidak sama dengan baris iklan di Detail pesanan (${rupiah(adSum)}).`,
    );
  const knownWallet = new Set(["Earnings", "Withdrawal", "GMV Pay Deduction"]);
  const otherTypes = [
    ...new Set(
      wallet.map((w) => w.txn_type).filter((t) => !knownWallet.has(t)),
    ),
  ];
  if (otherTypes.length > 0)
    wWarn.push(
      `Jenis transaksi dana yang belum pernah diuji: ${otherTypes.join(", ")}.`,
    );

  return {
    income,
    wallet: {
      rows: wallet,
      store: {},
      period: period ?? minMax(wallet.map((w) => w.requested_on)),
      warnings: wWarn,
      info: {
        baris: wallet.length,
        dana_masuk: Math.round(earnings),
        penarikan: Math.round(sumType("Withdrawal")),
        potongan_iklan: Math.round(deduction),
      },
    },
  };
}

// ---------------------------------------------------------------- IKLAN HARIAN (Campaign overview)

export type TtAdsRow = {
  day: string;
  cost: number;
  sku_orders: number;
  gross_revenue: number;
  roi: number | null;
};

export function parseTtAds(rows: Rows): ParsedFile<TtAdsRow> {
  const h = findHeaderRow(rows, ["Per Hari", "Biaya"]);
  if (h < 0) {
    throw new ParseError(
      "Ini bukan file 'Campaign overview' TikTok Shop: kolom 'Per Hari' dan 'Biaya' tidak ditemukan.",
    );
  }
  const idx = headerIndex(rows[h]);
  const ordersCol = colStarting(idx, "Pesanan SKU");
  const grossCol = colStarting(idx, "Penghasilan bruto");
  const roiCol = colStarting(idx, "ROI");
  const dayCol = idx.get("Per Hari") as number;
  const costCol = idx.get("Biaya") as number;
  if (ordersCol == null || grossCol == null) {
    throw new ParseError(
      "Kolom 'Pesanan SKU' atau 'Penghasilan bruto' tidak ditemukan di file Campaign overview.",
    );
  }

  const out: TtAdsRow[] = [];
  const seen = new Set<string>();
  let total: { cost: number; orders: number; gross: number } | null = null;
  let badRows = 0;
  let duplicates = 0;

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const rawDay = r[dayCol];
    if (str(rawDay) === "") continue;
    const cost = num(r[costCol]);
    if (str(rawDay) === "-" || /^total$/i.test(str(rawDay))) {
      total = {
        cost: cost ?? 0,
        orders: num(r[ordersCol]) ?? 0,
        gross: num(r[grossCol]) ?? 0,
      };
      continue;
    }
    const day = dayOf(rawDay);
    if (!day || cost == null) {
      badRows++;
      continue;
    }
    if (seen.has(day)) {
      duplicates++;
      continue;
    }
    seen.add(day);
    out.push({
      day,
      cost,
      sku_orders: int(num(r[ordersCol])) ?? 0,
      gross_revenue: num(r[grossCol]) ?? 0,
      roi: roiCol == null ? null : num(r[roiCol]),
    });
  }

  if (badRows > 0)
    throw new ParseError(
      `${badRows} baris di file Campaign overview tidak punya tanggal atau biaya yang valid.`,
    );
  if (out.length === 0)
    throw new ParseError(
      "File Campaign overview ini tidak berisi baris harian.",
    );

  const warnings: string[] = [];
  if (duplicates > 0)
    warnings.push(`${duplicates} baris dengan tanggal kembar dilewati.`);
  const totalCost = out.reduce((a, o) => a + o.cost, 0);
  const totalOrders = out.reduce((a, o) => a + o.sku_orders, 0);
  const totalGross = out.reduce((a, o) => a + o.gross_revenue, 0);
  if (total) {
    if (Math.abs(total.cost - totalCost) > 1 || total.orders !== totalOrders) {
      throw new ParseError(
        `Jumlah biaya atau pesanan di baris harian (${rupiah(totalCost)}, ${totalOrders} pesanan) tidak sama dengan baris total di file (${rupiah(total.cost)}, ${total.orders} pesanan). File mungkin terpotong.`,
      );
    }
    // Penghasilan bruto dibulatkan Shopee per hari; selisih kecil wajar.
    if (Math.abs(total.gross - totalGross) > out.length)
      warnings.push(
        `Penghasilan bruto harian (${rupiah(totalGross)}) berbeda dari baris total (${rupiah(total.gross)}).`,
      );
  } else {
    warnings.push(
      "Baris total tidak ditemukan di file, jadi jumlah tidak bisa dicocokkan.",
    );
  }

  return {
    rows: out,
    store: {}, // file ini tidak memuat identitas toko
    period: minMax(out.map((o) => o.day)),
    warnings,
    info: {
      hari: out.length,
      hari_beriklan: out.filter((o) => o.cost > 0).length,
      total_biaya: Math.round(totalCost),
      pesanan_klaim: totalOrders,
    },
  };
}

// ---------------------------------------------------------------- PENGENALAN JENIS FILE

export type TtFileKind =
  | "tt_orders"
  | "tt_income"
  | "tt_ads"
  | "tt_profit_loss"; // dikenali tetapi tidak dipakai

// Dipanggil dengan nama sheet dan baris sheet pertama. null = bukan file TikTok yang dikenal
// (biarkan jalur Shopee yang mencoba).
export function detectTtFile(
  sheetNames: string[],
  firstSheet: Rows,
): TtFileKind | null {
  const has = (n: string) => sheetNames.includes(n);
  if (has("Detail pesanan") && has("Laporan") && has("Riwayat penarikan"))
    return "tt_income";
  if (has("Data utama") && has("Detail pesanan")) return "tt_profit_loss";
  const head = firstSheet.slice(0, 12);
  const hasCells = (...names: string[]) =>
    head.some((r) => {
      const s = new Set(r.map(str));
      return names.every((n) => s.has(n));
    });
  if (hasCells("Order ID", "Order Status")) return "tt_orders";
  if (hasCells("Per Hari", "Biaya")) return "tt_ads";
  return null;
}
