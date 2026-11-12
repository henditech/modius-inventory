// lib/analytics/ttSaldoView.ts
// Fungsi murni untuk tampilan tab Saldo TikTok: rentang cepat dan kalimat temuan.
// Memakai kembali pilihan rentang dari ttIklanView.ts (logikanya sama, hanya nama kolom
// cakupan datanya yang beda).
import type { TtSaldoData } from "./ttSaldo";
import {
  PRESET_LABEL,
  presetRange as rangeFor,
  type Preset,
} from "./ttIklanView";
import { rp } from "./uploadView";

export { PRESET_LABEL };
export type { Preset };

export function presetRange(
  p: Preset,
  cov: { walletFirst: string | null; walletLast: string | null },
  today: string,
): { from: string; to: string } | null {
  return rangeFor(
    p,
    { adsFirst: cov.walletFirst, adsLast: cov.walletLast },
    today,
  );
}

const dayTxt = (n: number): string => n.toFixed(1).replace(".", ",");

export function insightLines(d: TtSaldoData): string[] {
  const s = d.summary;
  const v = d.derived;
  if (s.entries === 0) return ["Belum ada data saldo di rentang ini."];

  const lines: string[] = [];
  lines.push(
    `Dana bersih yang masuk ${rp(v.netIncome)}: dana pesanan ${rp(s.earnings)} dikurangi potongan iklan ${rp(Math.abs(s.adsDeduction))}.`,
  );

  if (s.withdrawalCount > 0) {
    let w = `${s.withdrawalCount} kali penarikan, total ${rp(v.withdrawn)}`;
    if (v.avgWithdrawal != null)
      w += `, rata-rata ${rp(v.avgWithdrawal)} per penarikan`;
    w += `, terbesar ${rp(s.largestWithdrawal)}`;
    if (v.avgGapDays != null)
      w += `. Rata-rata jarak antar penarikan ${dayTxt(v.avgGapDays)} hari`;
    lines.push(`${w}.`);

    // Selisih dibaca terhadap dana bersih yang masuk (netChange tanpa jenis lain).
    const gap = v.netIncome - v.withdrawn;
    if (gap < 0) {
      lines.push(
        `Penarikan ${rp(-gap)} lebih besar dari dana bersih yang masuk di periode ini, jadi sebagian diambil dari saldo sebelum periode ini.`,
      );
    } else if (gap > 0) {
      lines.push(
        `Dana bersih yang masuk ${rp(gap)} lebih besar dari yang ditarik, jadi saldo bertambah sekitar itu di periode ini.`,
      );
    } else {
      lines.push("Dana bersih yang masuk sama dengan yang ditarik.");
    }
  } else {
    lines.push("Tidak ada penarikan di rentang ini.");
  }

  lines.push(
    "File TikTok tidak memuat saldo, jadi ini arus dana selama periode, bukan saldo yang tersisa.",
  );
  return lines;
}
