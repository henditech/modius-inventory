// lib/analytics/uploadView.ts
// Pembantu tampilan untuk halaman Upload (fungsi murni, mudah diuji).
import type { FileKind, ReadResult } from "./readFile";

export const KIND_ORDER: FileKind[] = ["orders", "income", "wallet", "ads"];

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
