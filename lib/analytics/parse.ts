// lib/analytics/parse.ts
// Pembaca file Shopee (pesanan, penghasilan, saldo, iklan). Fungsi murni tanpa
// dependensi: menerima baris-baris mentah (array 2 dimensi) dan mengembalikan baris
// bersih yang siap diunggah. Dijalankan DI BROWSER, sebelum apa pun dikirim ke server.
//
// Aturan privasi: hanya kolom yang tercantum di bawah yang dibaca. Username pembeli,
// nama penerima, telepon, alamat, kota, provinsi, dan catatan pembeli TIDAK pernah
// disentuh, jadi tidak mungkin ikut terkirim.

export class ParseError extends Error {}

type Cell = unknown;
export type Rows = Cell[][];

export type StoreHint = { username?: string; shopId?: string };
export type Period = { start: string; end: string };

export type ParsedFile<T> = {
  rows: T[];
  store: StoreHint; // identitas toko yang tertulis di file (kosong untuk file pesanan)
  period: Period | null;
  warnings: string[];
  info: Record<string, number>; // ringkasan untuk ditampilkan sebelum disimpan
};

// ---------------------------------------------------------------- utilitas dasar

const str = (v: Cell): string => (v == null ? "" : String(v).trim());

// Angka biasa: number, atau teks dengan titik sebagai desimal ("2047430", "13559.14").
function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Angka berformat Indonesia: titik = ribuan, koma = desimal ("99.000" -> 99000).
// File pesanan menyimpan SEMUA angka seperti ini sebagai teks.
export function numId(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (s === "" || s === "-") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const int = (n: number | null): number | null =>
  n == null ? null : Math.round(n);

// "2026-10-01 00:43[:05]" (WIB) -> "2026-10-01T00:43:05+07:00"
function wibIso(v: Cell): string | null {
  const m = str(v).match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}+07:00`;
}

// "2026-10-28" (atau dengan jam) -> "2026-10-28"
function isoDate(v: Cell): string | null {
  const m = str(v).match(/^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/);
  return m ? m[1] : null;
}

// "13/04/2026[ 00:00:00]" -> "2026-04-13"
function dmyDate(v: Cell): string | null {
  const m = str(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function findHeaderRow(rows: Rows, must: string[], scan = 40): number {
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

// Penjumlahan semua kolom yang namanya diawali prefix tertentu (mis. "Biaya Gratis Ongkir XTRA").
function prefixCols(idx: Map<string, number>, prefix: string): number[] {
  return [...idx.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([, i]) => i);
}

function minMax(dates: (string | null)[]): Period | null {
  const d = dates.filter((x): x is string => !!x).sort();
  return d.length ? { start: d[0], end: d[d.length - 1] } : null;
}

// ---------------------------------------------------------------- PESANAN

export type OrderRow = {
  order_no: string;
  sku_ref: string;
  variation: string;
  status: string;
  cancel_reason: string | null;
  return_status: string | null;
  tracking_no: string | null;
  shipping_option: string | null;
  payment_method: string | null;
  sku_parent: string | null;
  product_name: string;
  list_price: number | null;
  unit_price: number | null;
  qty: number;
  returned_qty: number;
  subtotal: number | null;
  seller_voucher: number | null;
  shopee_voucher: number | null;
  total_paid: number | null;
  ordered_at: string;
  paid_at: string | null;
  completed_at: string | null;
};

export function parseOrders(rows: Rows): ParsedFile<OrderRow> {
  const h = findHeaderRow(rows, [
    "No. Pesanan",
    "Status Pesanan",
    "Nama Produk",
  ]);
  if (h < 0) {
    throw new ParseError(
      "Ini bukan file pesanan Shopee: kolom 'No. Pesanan', 'Status Pesanan', dan 'Nama Produk' tidak ditemukan.",
    );
  }
  const idx = headerIndex(rows[h]);
  const get = (r: Cell[], name: string): Cell => {
    const i = idx.get(name);
    return i == null ? "" : r[i];
  };
  const text = (r: Cell[], name: string): string | null =>
    str(get(r, name)) || null;

  const out: OrderRow[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  let duplicates = 0;
  let badRows = 0;

  for (const r of rows.slice(h + 1)) {
    const order_no = str(get(r, "No. Pesanan"));
    if (!order_no) continue;

    const ordered_at = wibIso(get(r, "Waktu Pesanan Dibuat"));
    const product_name = str(get(r, "Nama Produk"));
    const status = str(get(r, "Status Pesanan"));
    if (!ordered_at || !product_name || !status) {
      badRows++;
      continue;
    }

    const row: OrderRow = {
      order_no,
      sku_ref: str(get(r, "Nomor Referensi SKU")) || "-",
      variation: str(get(r, "Nama Variasi")) || "-",
      status,
      cancel_reason: text(r, "Alasan Pembatalan"),
      return_status: text(r, "Status Pembatalan/ Pengembalian"),
      tracking_no: text(r, "No. Resi"),
      shipping_option: text(r, "Opsi Pengiriman"),
      payment_method: text(r, "Metode Pembayaran"),
      sku_parent: text(r, "SKU Induk"),
      product_name,
      list_price: numId(get(r, "Harga Awal")),
      unit_price: numId(get(r, "Harga Setelah Diskon")),
      qty: int(numId(get(r, "Jumlah"))) ?? 1,
      returned_qty: int(numId(get(r, "Returned quantity"))) ?? 0,
      subtotal: numId(get(r, "Subtotal Pesanan")),
      seller_voucher: numId(get(r, "Voucher Ditanggung Penjual")),
      shopee_voucher: numId(get(r, "Voucher Ditanggung Shopee")),
      total_paid: numId(get(r, "Total Pembayaran")),
      ordered_at,
      paid_at: wibIso(get(r, "Waktu Pembayaran Dilakukan")),
      completed_at: wibIso(get(r, "Waktu Pesanan Selesai")),
    };

    // Kunci sama dengan batas unik di database (05_orders_key.sql).
    const key = [order_no, product_name, row.sku_ref, row.variation].join(
      "\u0000",
    );
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    out.push(row);
  }

  if (badRows > 0) {
    warnings.push(
      `${badRows} baris dilewati karena nomor pesanan, status, nama produk, atau waktu pesanan tidak terbaca.`,
    );
  }
  if (duplicates > 0) {
    warnings.push(
      `${duplicates} baris kembar (pesanan, produk, SKU, dan variasi sama) dilewati.`,
    );
  }
  if (out.length === 0)
    throw new ParseError(
      "File pesanan ini tidak berisi baris pesanan yang bisa dibaca.",
    );

  return {
    rows: out,
    store: {},
    period: minMax(out.map((o) => o.ordered_at.slice(0, 10))),
    warnings,
    info: {
      baris: out.length,
      pesanan: new Set(out.map((o) => o.order_no)).size,
      dengan_resi: out.filter((o) => o.tracking_no).length,
    },
  };
}

// ---------------------------------------------------------------- PENGHASILAN

export type IncomeRow = {
  order_no: string;
  line_no: number;
  product_id: string;
  product_name: string;
  created_on: string | null;
  released_on: string | null;
  income: number;
  price: number;
  refund: number;
  shipping_buyer: number;
  shipping_paid: number;
  shipping_courier_discount: number;
  shipping_shopee: number;
  shipping_return: number;
  return_to_seller_fee: number;
  shipping_refund: number;
  seller_voucher: number;
  seller_cofund: number;
  coin_cashback: number;
  shopee_discount: number;
  fee_admin: number;
  fee_process: number;
  fee_xtra: number;
  fee_transaction: number;
  fee_promo_xtra: number;
  fee_campaign: number;
  fee_affiliate: number;
  auto_topup: number;
  fee_premium: number;
  fee_fbs: number;
  tax_pph22: number;
};

// field di database -> nama kolom di file (satu kolom)
const INCOME_SIMPLE: [keyof IncomeRow, string][] = [
  ["price", "Harga Produk"],
  ["refund", "Jumlah Pengembalian Dana ke Pembeli"],
  ["shipping_buyer", "Ongkir Dibayar Pembeli"],
  ["shipping_paid", "Ongkos Kirim yang Dibayarkan ke Jasa Kirim"],
  ["shipping_courier_discount", "Potongan Ongkos Kirim dari Jasa Kirim"],
  ["shipping_shopee", "Gratis Ongkir dari Shopee"],
  ["shipping_return", "Ongkos Kirim Pengembalian Barang"],
  ["return_to_seller_fee", "Return to Seller Fee"],
  ["shipping_refund", "Pengembalian Biaya Kirim"],
  ["seller_voucher", "Voucher disponsor oleh Penjual"],
  ["seller_cofund", "Voucher co-fund disponsor oleh Penjual"],
  ["shopee_discount", "Diskon Produk dari Shopee"],
  ["fee_admin", "Biaya Administrasi"],
  ["fee_process", "Biaya Proses Pesanan"],
  ["fee_transaction", "Biaya Transaksi"],
  ["fee_promo_xtra", "Biaya Layanan Promo XTRA"],
  ["fee_campaign", "Biaya Kampanye"],
  ["fee_affiliate", "Biaya Komisi AMS"],
  ["fee_premium", "Premi"],
  ["fee_fbs", "FBS Fee"],
  ["tax_pph22", "PPh 22"],
];

// Baris label di sheet Summary/ringkasan: cari baris yang kolom pertamanya cocok.
function findLabelRow(
  rows: Rows,
  label: string,
  startsWith = false,
): Cell[] | null {
  for (const r of rows) {
    const c = str(r[0]);
    if (startsWith ? c.startsWith(label) : c === label) return r;
  }
  return null;
}

function lastNumber(r: Cell[]): number | null {
  for (let i = r.length - 1; i >= 1; i--) {
    const n = num(r[i]);
    if (n != null) return n;
  }
  return null;
}

export function parseIncome(book: Record<string, Rows>): ParsedFile<IncomeRow> {
  const sheet = book["Penghasilan"];
  if (!sheet) {
    throw new ParseError(
      "Ini bukan file 'Income sudah dilepas': sheet 'Penghasilan' tidak ditemukan.",
    );
  }
  const h = findHeaderRow(sheet, [
    "No. Pesanan",
    "Lihat berdasarkan",
    "ID Produk",
    "Total Penghasilan",
  ]);
  if (h < 0) throw new ParseError("Header sheet 'Penghasilan' tidak dikenali.");

  const header = sheet[h];
  const idx = headerIndex(header);
  const get = (r: Cell[], name: string): Cell => {
    const i = idx.get(name);
    return i == null ? "" : r[i];
  };
  const numAt = (r: Cell[], name: string): number => num(get(r, name)) ?? 0;
  const xtraCols = prefixCols(idx, "Biaya Gratis Ongkir XTRA");
  const topupCols = prefixCols(idx, "Biaya Isi Saldo Otomatis");
  const coinCols = [
    ...prefixCols(idx, "Cashback Koin disponsori Penjual"),
    ...prefixCols(idx, "Cashback Koin Co-fund disponsori Penjual"),
  ];

  const out: IncomeRow[] = [];
  const lineCounter = new Map<string, number>();
  let badRows = 0;

  for (const r of sheet.slice(h + 1)) {
    // Baris "Order" adalah ringkasan dengan total yang sama; hanya baris "Sku" yang disimpan.
    if (str(get(r, "Lihat berdasarkan")) !== "Sku") continue;

    const order_no = str(get(r, "No. Pesanan"));
    const product_id = str(get(r, "ID Produk"));
    const income = num(get(r, "Total Penghasilan"));
    if (!order_no || !product_id || product_id === "-" || income == null) {
      badRows++;
      continue;
    }
    const line_no = (lineCounter.get(order_no) ?? 0) + 1;
    lineCounter.set(order_no, line_no);

    const sumCols = (cols: number[]) =>
      cols.reduce((a, i) => a + (num(r[i]) ?? 0), 0);

    const row = {
      order_no,
      line_no,
      product_id,
      product_name: str(get(r, "Nama Produk")) || "-",
      created_on: isoDate(get(r, "Waktu Pesanan Dibuat")),
      released_on: isoDate(get(r, "Tanggal Dana Dilepaskan")),
      income,
      fee_xtra: sumCols(xtraCols),
      auto_topup: sumCols(topupCols),
      coin_cashback: sumCols(coinCols),
    } as IncomeRow;
    for (const [field, col] of INCOME_SIMPLE) {
      (row as unknown as Record<string, number>)[field as string] = numAt(
        r,
        col,
      );
    }
    out.push(row);
  }

  if (badRows > 0) {
    throw new ParseError(
      `${badRows} baris Sku tidak punya nomor pesanan, ID produk, atau total penghasilan yang valid.`,
    );
  }
  if (out.length === 0)
    throw new ParseError("Tidak ada baris Sku di sheet 'Penghasilan'.");

  // Ringkasan di sheet Summary: identitas toko, periode, dan total yang dilepas.
  const summary = book["Summary"] ?? [];
  const usernameRow = findLabelRow(summary, "Username (Penjual)");
  const from = findLabelRow(summary, "Dari");
  const to = findLabelRow(summary, "ke") ?? findLabelRow(summary, "Ke");
  const totalRow = findLabelRow(summary, "3. Total yang Dilepas", true);

  const sum = out.reduce((a, o) => a + o.income, 0);
  const warnings: string[] = [];
  if (totalRow) {
    const expected = lastNumber(totalRow);
    if (expected != null && Math.abs(expected - sum) > 1) {
      throw new ParseError(
        `Jumlah penghasilan di baris data (${Math.round(sum)}) tidak sama dengan total di Summary (${Math.round(expected)}). File mungkin terpotong atau rusak.`,
      );
    }
  } else {
    warnings.push(
      "Total 'yang dilepas' di sheet Summary tidak ditemukan, jadi jumlah tidak bisa dicocokkan.",
    );
  }

  const start = from ? isoDate(from[1]) : null;
  const end = to ? isoDate(to[1]) : null;

  return {
    rows: out,
    store: {
      username: usernameRow ? str(usernameRow[1]) || undefined : undefined,
    },
    period:
      start && end ? { start, end } : minMax(out.map((o) => o.released_on)),
    warnings,
    info: {
      baris: out.length,
      pesanan: lineCounter.size,
      total_dilepas: Math.round(sum),
    },
  };
}

// ---------------------------------------------------------------- SALDO

export type WalletRow = {
  txn_at: string;
  txn_type: string;
  description: string | null;
  order_no: string;
  amount: number;
  status: string | null;
  balance_after: number;
};

export function parseWallet(rows: Rows): ParsedFile<WalletRow> & {
  balanceFirst: number;
  balanceLast: number;
} {
  const h = findHeaderRow(rows, [
    "Tanggal Transaksi",
    "Tipe Transaksi",
    "Jumlah",
    "Saldo Akhir",
  ]);
  if (h < 0) {
    throw new ParseError(
      "Ini bukan laporan transaksi saldo Shopee: kolom 'Tanggal Transaksi' dan 'Saldo Akhir' tidak ditemukan.",
    );
  }
  const idx = headerIndex(rows[h]);
  const get = (r: Cell[], name: string): Cell => {
    const i = idx.get(name);
    return i == null ? "" : r[i];
  };

  // Urutan di file: terbaru dulu. Dibalik supaya urut waktu, dan transaksi pada detik yang
  // sama tetap berurutan seperti terjadinya.
  const body = rows
    .slice(h + 1)
    .filter((r) => str(r[0]) !== "")
    .reverse();
  const out: WalletRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const r of body) {
    const txn_at = wibIso(get(r, "Tanggal Transaksi"));
    const amount = num(get(r, "Jumlah"));
    const balance_after = num(get(r, "Saldo Akhir"));
    const txn_type = str(get(r, "Tipe Transaksi"));
    if (!txn_at || amount == null || balance_after == null || !txn_type) {
      throw new ParseError(
        "Ada baris saldo yang tanggal, tipe, jumlah, atau saldo akhirnya tidak terbaca.",
      );
    }
    const row: WalletRow = {
      txn_at,
      txn_type,
      description: str(get(r, "Deskripsi")) || null,
      order_no: str(get(r, "No. Pesanan")) || "-",
      amount,
      status: str(get(r, "Status")) || null,
      balance_after,
    };
    const key = [txn_at, txn_type, row.order_no, amount, balance_after].join(
      "\u0000",
    );
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  if (out.length === 0)
    throw new ParseError("Laporan saldo ini tidak berisi transaksi.");

  const warnings: string[] = [];
  if (duplicates > 0) warnings.push(`${duplicates} baris kembar dilewati.`);

  // Pemeriksaan 1: total masuk dan keluar harus sama dengan ringkasan di bagian atas file.
  const inRow = findLabelRow(rows.slice(0, h), "Total Saldo Masuk");
  const outRow = findLabelRow(rows.slice(0, h), "Total Saldo Keluar");
  const totalIn = out
    .filter((o) => o.amount > 0)
    .reduce((a, o) => a + o.amount, 0);
  const totalOut = out
    .filter((o) => o.amount < 0)
    .reduce((a, o) => a + o.amount, 0);
  if (inRow && outRow) {
    const expIn = num(inRow[4]);
    const expOut = num(outRow[4]);
    if (
      (expIn != null && Math.abs(expIn - totalIn) > 1) ||
      (expOut != null && Math.abs(expOut - totalOut) > 1)
    ) {
      throw new ParseError(
        "Total saldo masuk atau keluar di baris data tidak sama dengan ringkasan di file. File mungkin terpotong.",
      );
    }
  } else {
    warnings.push(
      "Ringkasan total masuk dan keluar tidak ditemukan, jadi jumlah tidak bisa dicocokkan.",
    );
  }

  // Pemeriksaan 2: saldo harus bersambung dari satu baris ke baris berikutnya.
  let breaks = 0;
  for (let i = 1; i < out.length; i++) {
    if (
      Math.abs(
        out[i].balance_after - out[i].amount - out[i - 1].balance_after,
      ) > 0.5
    )
      breaks++;
  }
  if (breaks > 0) {
    warnings.push(
      `Saldo tidak bersambung di ${breaks} tempat dalam file ini (mungkin ada transaksi yang hilang).`,
    );
  }

  const head = rows.slice(0, h);
  const usernameRow = findLabelRow(head, "Username (Penjual)");
  const from = findLabelRow(head, "Dari");
  const to = findLabelRow(head, "Ke");
  const start = from ? isoDate(from[1]) : null;
  const end = to ? isoDate(to[1]) : null;

  return {
    rows: out,
    store: {
      username: usernameRow ? str(usernameRow[1]) || undefined : undefined,
    },
    period:
      start && end
        ? { start, end }
        : minMax(out.map((o) => o.txn_at.slice(0, 10))),
    warnings,
    info: {
      baris: out.length,
      total_masuk: Math.round(totalIn),
      total_keluar: Math.round(totalOut),
    },
    balanceFirst: out[0].balance_after - out[0].amount,
    balanceLast: out[out.length - 1].balance_after,
  };
}

// ---------------------------------------------------------------- IKLAN (CSV)

export type AdsRow = {
  period_start: string;
  period_end: string;
  product_code: string;
  ad_name: string;
  status: string | null;
  bidding_mode: string | null;
  started_on: string | null;
  impressions: number | null;
  clicks: number | null;
  add_to_cart: number | null;
  conversions: number | null;
  units_sold: number | null;
  gmv: number | null;
  cost: number | null;
};

// CSV sederhana: kutip ganda, kutip di dalam kutip (""), CRLF atau LF, BOM di awal.
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Akhiran " [4]" di nama iklan adalah nomor urut dari Shopee dan bisa bergeser.
export function cleanAdName(name: string): string {
  return name.replace(/\s*\[\d+\]\s*$/, "").trim();
}

const ADS_SUM_FIELDS = [
  "impressions",
  "clicks",
  "add_to_cart",
  "conversions",
  "units_sold",
  "gmv",
  "cost",
] as const;

export function parseAds(csvText: string): ParsedFile<AdsRow> {
  const rows = parseCsv(csvText);
  const h = findHeaderRow(rows, ["Nama Iklan", "Kode Produk", "Biaya"], 30);
  if (h < 0) {
    throw new ParseError(
      "Ini bukan file 'Data Keseluruhan Iklan' Shopee: kolom 'Nama Iklan', 'Kode Produk', dan 'Biaya' tidak ditemukan.",
    );
  }
  const head = rows.slice(0, h);
  const kv = (label: string): string => {
    const r = head.find((x) => str(x[0]) === label);
    return r ? str(r[1]) : "";
  };

  const periode = kv("Periode").match(
    /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/,
  );
  const start = periode ? dmyDate(periode[1]) : null;
  const end = periode ? dmyDate(periode[2]) : null;
  if (!start || !end)
    throw new ParseError("Baris 'Periode' di file iklan tidak terbaca.");

  const idx = headerIndex(rows[h]);
  const get = (r: Cell[], name: string): Cell => {
    const i = idx.get(name);
    return i == null ? "" : r[i];
  };
  const n = (r: Cell[], name: string) => num(get(r, name));
  const ni = (r: Cell[], name: string) => int(n(r, name));

  const merged = new Map<string, AdsRow>();
  let combined = 0;

  for (const r of rows.slice(h + 1)) {
    const rawName = str(get(r, "Nama Iklan"));
    if (!rawName) continue;
    const ad_name = cleanAdName(rawName);
    const product_code = str(get(r, "Kode Produk")) || "-";
    const row: AdsRow = {
      period_start: start,
      period_end: end,
      product_code,
      ad_name,
      status: str(get(r, "Status")) || null,
      bidding_mode: str(get(r, "Mode Bidding")) || null,
      started_on: dmyDate(get(r, "Tanggal Mulai")),
      impressions: ni(r, "Dilihat"),
      clicks: ni(r, "Jumlah Klik"),
      add_to_cart: ni(r, "Tambah ke Keranjang"),
      conversions: ni(r, "Konversi"),
      units_sold: ni(r, "Produk Terjual"),
      gmv: n(r, "Omzet Penjualan"),
      cost: n(r, "Biaya"),
    };
    const key = [product_code, ad_name].join("\u0000");
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
    } else {
      // Dua iklan yang setelah nomor urutnya dibuang bernama sama untuk produk yang sama:
      // digabung (dijumlahkan) supaya tidak bentrok dengan batas unik di database.
      combined++;
      for (const f of ADS_SUM_FIELDS) {
        const a = prev[f];
        const b = row[f];
        (prev as Record<string, unknown>)[f] =
          a == null && b == null ? null : (a ?? 0) + (b ?? 0);
      }
    }
  }

  const out = [...merged.values()];
  if (out.length === 0)
    throw new ParseError("File iklan ini tidak berisi baris iklan.");
  const warnings: string[] = [];
  if (combined > 0)
    warnings.push(
      `${combined} iklan bernama sama untuk produk yang sama digabung menjadi satu baris.`,
    );

  return {
    rows: out,
    store: {
      username: kv("Username") || undefined,
      shopId: kv("ID Toko") || undefined,
    },
    period: { start, end },
    warnings,
    info: {
      iklan: out.length,
      total_biaya: Math.round(out.reduce((a, o) => a + (o.cost ?? 0), 0)),
    },
  };
}
