// lib/analytics/readFile.ts
// Membuka file Shopee di BROWSER, mengenali jenisnya, lalu menyerahkan baris mentah ke
// parse.ts. Tidak ada isi file yang dikirim ke mana pun dari sini.
//
// Butuh paket SheetJS. Jangan pakai `npm i xlsx` biasa: versi di npm sudah usang (0.18.5).
// Pasang dari CDN resmi SheetJS:
//   npm i https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
// (kalau proyek ini sudah punya `xlsx` dari sumber itu, tidak perlu dipasang lagi)
import * as XLSX from "xlsx";
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

export type FileKind = "orders" | "income" | "wallet" | "ads";

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
  | { kind: "ads"; fileName: string; parsed: ParsedFile<AdsRow> };

export const KIND_LABEL: Record<FileKind, string> = {
  orders: "Pesanan",
  income: "Penghasilan",
  wallet: "Saldo",
  ads: "Iklan",
};

export async function readShopeeFile(file: File): Promise<ReadResult> {
  const fileName = file.name;

  // Iklan: CSV
  if (/\.csv$/i.test(fileName)) {
    const text = await file.text();
    return { kind: "ads", fileName, parsed: parseAds(text) };
  }

  if (!/\.xlsx$/i.test(fileName)) {
    throw new ParseError(
      "Format file tidak dikenali. Pakai file .xlsx atau .csv langsung dari Shopee, tanpa diubah.",
    );
  }

  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetRows = (name: string): Rows =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
    });

  // Penghasilan: punya sheet "Penghasilan" (+ "Summary" untuk identitas toko dan pencocokan total)
  if (wb.SheetNames.includes("Penghasilan")) {
    const book: Record<string, Rows> = {
      Penghasilan: sheetRows("Penghasilan"),
    };
    if (wb.SheetNames.includes("Summary"))
      book["Summary"] = sheetRows("Summary");
    return { kind: "income", fileName, parsed: parseIncome(book) };
  }

  // Saldo atau pesanan: dibedakan lewat header sheet pertama
  const first = sheetRows(wb.SheetNames[0]);
  const isWallet = first
    .slice(0, 40)
    .some((r) => r.some((c) => String(c ?? "").trim() === "Tipe Transaksi"));
  if (isWallet) return { kind: "wallet", fileName, parsed: parseWallet(first) };

  return { kind: "orders", fileName, parsed: parseOrders(first) };
}
