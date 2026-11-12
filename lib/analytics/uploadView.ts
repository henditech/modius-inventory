// lib/analytics/uploadView.ts
// Pembantu tampilan untuk halaman Upload (fungsi murni, mudah diuji).
import type { FileKind, ReadResult } from "./readFile";

// Urutan menyimpan. "ads" harus sebelum "ads_auto": rincian iklan otomatis dicocokkan dengan
// file iklan utama periode yang sama. Jenis TikTok: pesanan, penghasilan, dana, iklan.
export const KIND_ORDER: FileKind[] = [
  "orders",
  "income",
  "wallet",
  "ads",
  "ads_auto",
  "tt_orders",
  "tt_income",
  "tt_wallet",
  "tt_ads",
];

// Jenis file yang relevan untuk tiap marketplace (dipakai panel "Upload terakhir").
export const KINDS_OF: Record<"shopee" | "tiktok", FileKind[]> = {
  shopee: ["orders", "income", "wallet", "ads", "ads_auto"],
  tiktok: ["tt_orders", "tt_income", "tt_wallet", "tt_ads"],
};

const nf = (n: number | undefined): string =>
  Math.round(n ?? 0).toLocaleString("id-ID");
export const rp = (n: number): string => `Rp${nf(n)}`;

const BULAN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

// "2026-10-31" -> "31 Okt 2026"
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
}

export function periodLabel(
  p: { start: string; end: string } | null | undefined,
): string {
  if (!p) return "periode tidak diketahui";
  return p.start === p.end
    ? fmtDate(p.start)
    : `${fmtDate(p.start)} – ${fmtDate(p.end)}`;
}

// Berapa hari sejak tanggal itu (hari kalender WIB). null kalau tanggal tidak valid.
export function daysSince(
  isoDate: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!isoDate) return null;
  const t = Date.parse(`${isoDate}T00:00:00+07:00`);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
}

// Ringkasan isi file, ditampilkan sebelum disimpan supaya salah file langsung kelihatan.
export function summaryOf(r: ReadResult): string[] {
  switch (r.kind) {
    case "orders": {
      const i = r.parsed.info;
      return [
        `${nf(i.pesanan)} pesanan (${nf(i.baris)} baris)`,
        `${nf(i.dengan_resi)} baris punya nomor resi`,
      ];
    }
    case "income": {
      const i = r.parsed.info;
      return [
        `${nf(i.pesanan)} pesanan dilepas`,
        `Total dilepas ${rp(i.total_dilepas)}`,
      ];
    }
    case "wallet": {
      const p = r.parsed;
      return [
        `${nf(p.info.baris)} transaksi`,
        `Masuk ${rp(p.info.total_masuk)} · Keluar ${rp(Math.abs(p.info.total_keluar))}`,
        `Saldo ${rp(p.balanceFirst)} → ${rp(p.balanceLast)}`,
      ];
    }
    case "ads": {
      const i = r.parsed.info;
      return [`${nf(i.iklan)} iklan`, `Total biaya ${rp(i.total_biaya)}`];
    }
    case "ads_auto": {
      const i = r.parsed.info;
      return [
        `${nf(i.produk)} produk (${nf(i.produk_berbiaya)} yang kena biaya)`,
        `Total biaya ${rp(i.total_biaya)}`,
      ];
    }
    case "tt_orders": {
      const i = r.parsed.info;
      return [
        `${nf(i.pesanan)} pesanan (${nf(i.baris)} baris)`,
        `${nf(i.dibatalkan)} dibatalkan · ${nf(i.dengan_resi)} baris punya resi`,
      ];
    }
    case "tt_income": {
      const i = r.parsed.info;
      const lines = [
        `${nf(i.pesanan)} pesanan dilepas`,
        `Dana bersih ${rp(i.dana_bersih)}`,
      ];
      if (i.biaya_iklan !== 0)
        lines.push(`Potongan iklan ${rp(Math.abs(i.biaya_iklan))}`);
      return lines;
    }
    case "tt_wallet": {
      const i = r.parsed.info;
      return [
        `${nf(i.baris)} catatan dana`,
        `Dana masuk ${rp(i.dana_masuk)} · Penarikan ${rp(Math.abs(i.penarikan))}`,
      ];
    }
    case "tt_ads": {
      const i = r.parsed.info;
      return [
        `${nf(i.hari)} hari (${nf(i.hari_beriklan)} hari beriklan)`,
        `Total biaya ${rp(i.total_biaya)} · ${nf(i.pesanan_klaim)} pesanan diklaim iklan`,
      ];
    }
  }
}

// Urutan menyimpan: jenis file dulu, lalu periode terlama, supaya pemeriksaan
// saldo bersambung benar kalau beberapa file saldo disimpan sekaligus.
export function sortForSaving<
  T extends { result?: ReadResult; file: { name: string } },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.result?.kind ?? "orders");
    const kb = KIND_ORDER.indexOf(b.result?.kind ?? "orders");
    if (ka !== kb) return ka - kb;
    const sa = a.result?.parsed.period?.start ?? "";
    const sb = b.result?.parsed.period?.start ?? "";
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.file.name < b.file.name ? -1 : a.file.name > b.file.name ? 1 : 0;
  });
}

// Waktu lengkap dalam WIB, mis. "31 Okt, 21.38"
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

// "-Rp1.500" ditulis dengan tanda minus yang jelas: "−Rp1.500"
export const rpSigned = (n: number): string => (n < 0 ? `−${rp(-n)}` : rp(n));

// 74.6 -> "74,6%"
export const fmtPct = (n: number): string =>
  `${n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Status pencocokan penghasilan vs saldo (kode dari fungsi database -> kata untuk pengguna)
export const RECON_LABEL: Record<string, string> = {
  COCOK: "Cocok",
  COCOK_NOL: "Cocok (penghasilan Rp0)",
  BEDA_NOMINAL: "Beda nominal",
  HANYA_DI_PENGHASILAN: "Ada di penghasilan, belum di saldo",
  HANYA_DI_SALDO: "Ada di saldo, tidak ada di penghasilan",
};
