// lib/analytics/parseAdsAuto.ts
// Pembaca file kelima: "Rincian Data Iklan Produk Otomatis" (CSV dari Shopee).
// Dipisah dari parse.ts supaya parse.ts tidak perlu diubah. Fungsi murni, dijalankan
// DI BROWSER seperti parser lain. File ini tidak memuat data pembeli sama sekali.
//
// Bentuk file: beberapa baris pembuka (judul, Username, Nama Toko, ID Toko, Waktu Laporan
// Dibuat, Periode), baris kosong, lalu header "Urutan,Nama Produk,Kode Produk,...".
// Baris pertama data = total (Nama Produk "Iklan Produk Otomatis", Kode Produk "-"),
// berikutnya satu baris per produk.
import { ParseError, parseCsv, type ParsedFile } from "./parse";

export type AdsAutoRow = {
  period_start: string;
  period_end: string;
  product_code: string;
  product_name: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  conversions_direct: number | null;
  units_sold: number | null;
  units_direct: number | null;
  gmv: number | null;
  gmv_direct: number | null;
  cost: number | null;
};

// Toleransi pembulatan antara jumlah baris produk dan baris total (Oktober HS1: Rp2).
export const ADS_AUTO_TOLERANCE = 5;

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

function num(v: unknown): number | null {
  const s = str(v);
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const int = (n: number | null): number | null =>
  n == null ? null : Math.round(n);

function dmyDate(v: unknown): string | null {
  const m = str(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function findHeaderRow(rows: string[][], must: string[], scan = 30): number {
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const names = new Set(rows[i].map(str));
    if (must.every((m) => names.has(m))) return i;
  }
  return -1;
}

// Membedakan dua jenis CSV iklan dari headernya:
//   "ads"      : Data Keseluruhan Iklan (kolom Nama Iklan)
//   "ads_auto" : Rincian Data Iklan Produk Otomatis (kolom Nama Produk, tanpa Nama Iklan)
export function detectCsvKind(text: string): "ads" | "ads_auto" | null {
  const rows = parseCsv(text);
  if (findHeaderRow(rows, ["Nama Iklan", "Kode Produk", "Biaya"]) >= 0)
    return "ads";
  if (findHeaderRow(rows, ["Nama Produk", "Kode Produk", "Biaya"]) >= 0)
    return "ads_auto";
  return null;
}

const SUM_FIELDS = [
  "impressions",
  "clicks",
  "conversions",
  "conversions_direct",
  "units_sold",
  "units_direct",
  "gmv",
  "gmv_direct",
  "cost",
] as const;

export function parseAdsAuto(
  csvText: string,
): ParsedFile<AdsAutoRow> & { fileTotal: number | null } {
  const rows = parseCsv(csvText);
  const h = findHeaderRow(rows, ["Nama Produk", "Kode Produk", "Biaya"]);
  if (h < 0) {
    throw new ParseError(
      "Ini bukan file 'Rincian Data Iklan Produk Otomatis' Shopee: kolom 'Nama Produk', 'Kode Produk', dan 'Biaya' tidak ditemukan.",
    );
  }
  const head = rows.slice(0, h);

  // Rincian iklan jenis lain punya kolom mirip; jangan sampai tersimpan sebagai iklan otomatis.
  const title = str(head[0]?.[0]);
  if (!/^Iklan Produk Otomatis/i.test(title)) {
    throw new ParseError(
      `File ini rincian iklan jenis lain ("${title || "tanpa judul"}"), bukan Iklan Produk Otomatis.`,
    );
  }

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
    throw new ParseError("Baris 'Periode' di file rincian tidak terbaca.");

  const idx = new Map<string, number>();
  rows[h].forEach((c, i) => {
    const k = str(c);
    if (k && !idx.has(k)) idx.set(k, i);
  });
  const get = (r: string[], name: string): string => {
    const i = idx.get(name);
    return i == null ? "" : str(r[i]);
  };
  const n = (r: string[], name: string) => num(get(r, name));
  const ni = (r: string[], name: string) => int(n(r, name));

  const byCode = new Map<string, AdsAutoRow>();
  let fileTotal: number | null = null;
  let merged = 0;
  let skipped = 0;

  for (const r of rows.slice(h + 1)) {
    const name = get(r, "Nama Produk");
    const code = get(r, "Kode Produk");
    if (!name && !code) continue;

    // Baris total: tidak disimpan, hanya dipakai untuk mencocokkan jumlah.
    if (code === "" || code === "-") {
      if (/^Iklan Produk Otomatis/i.test(name)) {
        fileTotal = (fileTotal ?? 0) + (n(r, "Biaya") ?? 0);
      } else {
        skipped++;
      }
      continue;
    }

    const row: AdsAutoRow = {
      period_start: start,
      period_end: end,
      product_code: code,
      product_name: name || null,
      impressions: ni(r, "Dilihat"),
      clicks: ni(r, "Jumlah Klik"),
      conversions: ni(r, "Konversi"),
      conversions_direct: ni(r, "Konversi Langsung"),
      units_sold: ni(r, "Produk Terjual"),
      units_direct: ni(r, "Terjual Langsung"),
      gmv: n(r, "Omzet Penjualan"),
      gmv_direct: n(r, "Penjualan Langsung (GMV Langsung)"),
      cost: n(r, "Biaya"),
    };
    const prev = byCode.get(code);
    if (!prev) {
      byCode.set(code, row);
    } else {
      // Kode produk yang sama dua kali: dijumlahkan supaya tidak bentrok dengan batas unik.
      merged++;
      for (const f of SUM_FIELDS) {
        const a = prev[f];
        const b = row[f];
        prev[f] = a == null && b == null ? null : (a ?? 0) + (b ?? 0);
      }
    }
  }

  const out = [...byCode.values()];
  if (out.length === 0)
    throw new ParseError("File rincian ini tidak berisi baris produk.");

  const sum = out.reduce((a, o) => a + (o.cost ?? 0), 0);
  const warnings: string[] = [];
  if (fileTotal == null) {
    warnings.push(
      "Baris total (Iklan Produk Otomatis) tidak ditemukan di file, jadi jumlah biaya tidak bisa dicocokkan.",
    );
  } else if (Math.abs(fileTotal - sum) > ADS_AUTO_TOLERANCE) {
    throw new ParseError(
      `Jumlah biaya per produk (${Math.round(sum)}) tidak sama dengan baris total di file (${Math.round(fileTotal)}). File mungkin terpotong atau rusak.`,
    );
  }
  if (merged > 0)
    warnings.push(`${merged} baris dengan kode produk kembar digabung.`);
  if (skipped > 0)
    warnings.push(`${skipped} baris tanpa kode produk dilewati.`);

  return {
    rows: out,
    store: {
      username: kv("Username") || undefined,
      shopId: kv("ID Toko") || undefined,
    },
    period: { start, end },
    warnings,
    info: {
      produk: out.length,
      produk_berbiaya: out.filter((o) => (o.cost ?? 0) > 0).length,
      total_biaya: Math.round(sum),
    },
    fileTotal,
  };
}

// Pencocokan dengan file iklan utama untuk periode yang sama persis. Dipanggil server saat
// "check". reportCost = biaya Iklan Produk Otomatis di ads_report, atau null kalau file iklan
// utama untuk periode itu belum diupload sama sekali.
export function adsAutoCrossWarnings(
  fileTotal: number,
  reportCost: number | null,
): string[] {
  const rp = (x: number) => `Rp${Math.round(x).toLocaleString("id-ID")}`;
  if (reportCost == null) {
    return [
      "File iklan utama (Data Keseluruhan Iklan) untuk periode yang sama persis belum diupload. Rincian ini tersimpan, tetapi baru dipakai setelah file iklan utama periode itu ada.",
    ];
  }
  if (Math.abs(fileTotal - reportCost) > ADS_AUTO_TOLERANCE) {
    return [
      `Total Iklan Produk Otomatis di file rincian (${rp(fileTotal)}) tidak sama dengan di file iklan utama (${rp(reportCost)}). Periksa apakah periodenya sama.`,
    ];
  }
  return [];
}
