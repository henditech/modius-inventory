// lib/analytics/readFile.ts
// Membuka file Shopee dan TikTok Shop di BROWSER, mengenali jenisnya, lalu menyerahkan baris
// mentah ke parse.ts atau parseTikTok.ts. Tidak ada isi file yang dikirim ke mana pun dari sini.
//
// Butuh paket SheetJS. Jangan pakai `npm i xlsx` biasa: versi di npm sudah usang (0.18.5).
// Pasang dari CDN resmi SheetJS:
//   npm i https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
// (kalau proyek ini sudah punya `xlsx` dari sumber itu, tidak perlu dipasang lagi)
import * as XLSX from "xlsx";
import { detectCsvKind, parseAdsAuto, type AdsAutoRow } from "./parseAdsAuto";
import {
  ParseError,
  parseAds,
  parseIncome,
  parseOrders,
  parseWallet,
  type AdsRow,
  type IncomeRow,
  type OrderRow,
  type ParsedFile,
  type Rows,
  type WalletRow,
} from "./parse";
import {
  detectTtFile,
  parseTtAds,
  parseTtAdsCampaign,
  parseTtIncome,
  parseTtOrders,
  type TtIncomeRow,
  type TtOrderRow,
  type TtAdsRow,
  type TtAdsCampaignRow,
  type TtWalletRow,
} from "./parseTikTok";

export type FileKind =
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

export type ReadResult =
  | { kind: "orders"; fileName: string; parsed: ParsedFile<OrderRow> }
  | { kind: "income"; fileName: string; parsed: ParsedFile<IncomeRow> }
  | {
      kind: "wallet";
      fileName: string;
      parsed: ParsedFile<WalletRow> & {
        balanceFirst: number;
        balanceLast: number;
      };
    }
  | { kind: "ads"; fileName: string; parsed: ParsedFile<AdsRow> }
  | {
      kind: "ads_auto";
      fileName: string;
      parsed: ParsedFile<AdsAutoRow> & { fileTotal: number | null };
    }
  | { kind: "tt_orders"; fileName: string; parsed: ParsedFile<TtOrderRow> }
  | { kind: "tt_income"; fileName: string; parsed: ParsedFile<TtIncomeRow> }
  | { kind: "tt_wallet"; fileName: string; parsed: ParsedFile<TtWalletRow> }
  | { kind: "tt_ads"; fileName: string; parsed: ParsedFile<TtAdsRow> }
  | {
      kind: "tt_ads_campaign";
      fileName: string;
      parsed: ParsedFile<TtAdsCampaignRow>;
    };

export const KIND_LABEL: Record<FileKind, string> = {
  orders: "Pesanan",
  income: "Penghasilan",
  wallet: "Saldo",
  ads: "Iklan",
  ads_auto: "Rincian iklan otomatis",
  tt_orders: "Pesanan TikTok",
  tt_income: "Penghasilan TikTok",
  tt_wallet: "Dana TikTok",
  tt_ads: "Iklan TikTok (harian)",
  tt_ads_campaign: "Iklan TikTok (per kampanye)",
};

// File TikTok Shop (dibuat WPS) sering mencatat ukuran sheet salah: "A1" untuk pesanan dan
// Campaign overview, "A1:X19" untuk Detail pesanan yang isinya 159 baris x 77 kolom, "A1:H2"
// untuk Riwayat penarikan yang isinya 43 baris. sheet_to_json hanya membaca kotak yang tercatat,
// jadi baris dan kolom di luarnya hilang diam-diam. Karena itu rentang tiap sheet dihitung ulang
// dari sel yang benar-benar ada, dan hanya DIPERLUAS (tidak pernah dipersempit), jadi sheet yang
// ukurannya sudah benar tidak berubah.
function fixSheetRef(ws: XLSX.WorkSheet): void {
  const cur = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  let maxR = -1;
  let maxC = -1;
  for (const key of Object.keys(ws)) {
    if (key.charCodeAt(0) === 33) continue; // kunci "!ref", "!merges", dan sejenisnya
    const c = XLSX.utils.decode_cell(key);
    if (c.r > maxR) maxR = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  if (maxR < 0) return;
  if (cur && cur.e.r >= maxR && cur.e.c >= maxC) return; // sudah mencakup semua sel
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(maxR, cur?.e.r ?? 0), c: Math.max(maxC, cur?.e.c ?? 0) },
  });
}

// Satu file bisa menghasilkan lebih dari satu jenis data (file income TikTok = penghasilan +
// dana), jadi hasilnya berupa daftar.
export async function readUploadFile(file: File): Promise<ReadResult[]> {
  const fileName = file.name;

  // Iklan Shopee: CSV (dua jenis, dibedakan lewat header)
  if (/\.csv$/i.test(fileName)) {
    const text = await file.text();
    if (detectCsvKind(text) === "ads_auto") {
      return [{ kind: "ads_auto", fileName, parsed: parseAdsAuto(text) }];
    }
    return [{ kind: "ads", fileName, parsed: parseAds(text) }];
  }

  if (!/\.xlsx$/i.test(fileName)) {
    throw new ParseError(
      "Format file tidak dikenali. Pakai file .xlsx atau .csv langsung dari Shopee atau TikTok Shop, tanpa diubah.",
    );
  }

  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  for (const name of wb.SheetNames) fixSheetRef(wb.Sheets[name]);
  const sheetRows = (name: string): Rows =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
    });

  // TikTok Shop dulu: ciri-cirinya (nama sheet, header Inggris) tidak mungkin muncul di file Shopee.
  const first = sheetRows(wb.SheetNames[0]);
  const tt = detectTtFile(wb.SheetNames, first);
  if (tt === "tt_income") {
    const book: Record<string, Rows> = {
      "Detail pesanan": sheetRows("Detail pesanan"),
      Laporan: sheetRows("Laporan"),
      "Riwayat penarikan": sheetRows("Riwayat penarikan"),
    };
    const { income, wallet } = parseTtIncome(book);
    return [
      { kind: "tt_income", fileName, parsed: income },
      { kind: "tt_wallet", fileName, parsed: wallet },
    ];
  }
  if (tt === "tt_profit_loss") {
    throw new ParseError(
      "Ini file profit-loss TikTok Shop, yang tidak dipakai di sistem ini. Unduh file 'income' (sheet Detail pesanan, Laporan, dan Riwayat penarikan) sebagai gantinya.",
    );
  }
  if (tt === "tt_orders") {
    return [{ kind: "tt_orders", fileName, parsed: parseTtOrders(first) }];
  }
  if (tt === "tt_ads") {
    return [{ kind: "tt_ads", fileName, parsed: parseTtAds(first) }];
  }
  if (tt === "tt_ads_campaign") {
    return [
      {
        kind: "tt_ads_campaign",
        fileName,
        parsed: parseTtAdsCampaign(first),
      },
    ];
  }

  // Penghasilan Shopee: punya sheet "Penghasilan" (+ "Summary" untuk identitas toko dan pencocokan total)
  if (wb.SheetNames.includes("Penghasilan")) {
    const book: Record<string, Rows> = {
      Penghasilan: sheetRows("Penghasilan"),
    };
    if (wb.SheetNames.includes("Summary"))
      book["Summary"] = sheetRows("Summary");
    return [{ kind: "income", fileName, parsed: parseIncome(book) }];
  }

  // Saldo atau pesanan Shopee: dibedakan lewat header sheet pertama
  const isWallet = first
    .slice(0, 40)
    .some((r) => r.some((c) => String(c ?? "").trim() === "Tipe Transaksi"));
  if (isWallet)
    return [{ kind: "wallet", fileName, parsed: parseWallet(first) }];

  // Terakhir: harus benar-benar file pesanan Shopee. Kalau bukan, pesan "bukan file pesanan
  // Shopee" menyesatkan untuk file TikTok lain (traffic, live, dan sejenisnya), jadi diganti
  // dengan daftar file yang bisa dibaca.
  try {
    return [{ kind: "orders", fileName, parsed: parseOrders(first) }];
  } catch (e) {
    if (
      e instanceof ParseError &&
      e.message.startsWith("Ini bukan file pesanan Shopee")
    ) {
      throw new ParseError(
        "File ini tidak dikenali. Yang bisa dibaca: Shopee (Pesanan, Income sudah dilepas, Saldo, Iklan, Rincian Iklan Produk Otomatis) dan TikTok Shop (Semua pesanan, income, Campaign overview, Product campaign). File TikTok Shop lain seperti traffic, live, dan promosi belum didukung.",
      );
    }
    throw e;
  }
}

// Kompatibilitas: pembaca lama yang mengharapkan satu hasil per file.
export async function readShopeeFile(file: File): Promise<ReadResult> {
  const results = await readUploadFile(file);
  return results[0];
}
