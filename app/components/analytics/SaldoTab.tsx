"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DanaData } from "@/lib/analytics/dana";
import { weekLabel } from "@/lib/analytics/danaRange";
import {
  RECON_LABEL,
  fmtDate,
  fmtDateTime,
  rp,
  rpSigned,
} from "@/lib/analytics/uploadView";
import DanaShell from "./DanaShell";
import { Card, Stat } from "./ui";
import type { DanaState } from "./useDana";

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#0a0b0e",
    border: "1px solid #23262e",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#8b93a1" },
};

// Sumbu grafik: 7.500.000 -> "7,5 jt" (bukan dibulatkan jadi "8 jt")
const tickMoney = (v: number): string => {
  if (Math.abs(v) >= 1_000_000) {
    const m = v / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1).replace(".", ",")} jt`;
  }
  return `${Math.round(v / 1000)} rb`;
};

function View({ d }: { d: DanaData }) {
  const w = d.wallet;
  const rec = d.reconcile;
  const matched = rec.summary.filter(
    (s) => s.status === "COCOK" || s.status === "COCOK_NOL",
  );
  const matchedN = matched.reduce((a, s) => a + s.orders, 0);
  const problems = rec.summary.filter(
    (s) => s.status !== "COCOK" && s.status !== "COCOK_NOL",
  );
  const problemN = problems.reduce((a, s) => a + s.orders, 0);
  const balanced = Math.abs(w.checkDiff) <= 0.5;

  const chartData = w.weeks.map((x) => ({
    label: weekLabel(x.weekStart),
    masuk: x.orderIncome,
    iklan: Math.abs(x.adTopups),
    tarik: Math.abs(x.withdrawals),
  }));

  const ledger: { label: string; value: string; strong?: boolean }[] = [
    { label: "Saldo awal", value: rp(w.opening ?? 0), strong: true },
    { label: "Dana masuk dari pesanan", value: rpSigned(w.orderIncome) },
    { label: "Penyesuaian", value: rpSigned(w.adjustments) },
    { label: "Isi saldo iklan", value: rpSigned(w.adTopups) },
    { label: "Penarikan dana", value: rpSigned(w.withdrawals) },
  ];
  if (Math.abs(w.other) >= 0.5)
    ledger.push({ label: "Transaksi lainnya", value: rpSigned(w.other) });

  return (
    <div className="space-y-5">
      {w.nTxn === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Tidak ada transaksi saldo pada rentang ini.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Stat label="Saldo awal" value={rp(w.opening ?? 0)} />
            <Stat
              label="Dana masuk dari pesanan"
              value={rp(w.orderIncome)}
              tone="good"
              sub={`${w.nTxn} transaksi saldo`}
            />
            <Stat
              label="Penarikan"
              value={rp(Math.abs(w.withdrawals))}
              sub={`${d.wallet.withdrawalList.length} kali`}
              tone="warn"
            />
            <Stat label="Saldo akhir" value={rp(w.closing ?? 0)} />
          </div>

          <Card
            title="Buku saldo"
            subtitle="Dari saldo awal sampai saldo akhir pada rentang ini"
          >
            <table className="w-full text-sm max-w-md">
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.label} className="border-b border-white/5">
                    <td
                      className={`py-2 ${l.strong ? "text-neutral-200 font-medium" : "text-neutral-400"}`}
                    >
                      {l.label}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${l.strong ? "text-neutral-50 font-semibold" : "text-neutral-200"}`}
                    >
                      {l.value}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-3 text-neutral-200 font-medium">
                    Saldo akhir
                  </td>
                  <td className="pt-3 text-right tabular-nums text-neutral-50 font-semibold">
                    {rp(w.closing ?? 0)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p
              className={`text-xs mt-4 flex items-start gap-1.5 ${balanced ? "text-emerald-400" : "text-amber-300"}`}
            >
              {balanced ? (
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              )}
              {balanced
                ? "Saldo bersambung: saldo awal ditambah semua transaksi sama dengan saldo akhir."
                : `Saldo tidak bersambung, selisih ${rpSigned(w.checkDiff)}. Kemungkinan ada transaksi yang belum diupload.`}
            </p>
          </Card>
        </>
      )}

      {chartData.length > 0 && (
        <Card
          title="Per minggu"
          subtitle="Dana masuk, isi saldo iklan, dan penarikan (Senin–Minggu)"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="#23262e" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={tickMoney}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => rp(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="masuk"
                  name="Dana masuk"
                  fill="#34d399"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="iklan"
                  name="Isi saldo iklan"
                  fill="#fbbf24"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="tarik"
                  name="Penarikan"
                  fill="#fb7185"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto mt-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-white/10">
                  <th className="py-2 pr-3 font-medium">Minggu</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Saldo awal
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Dana masuk
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Penyesuaian
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Isi iklan
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Penarikan
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Saldo akhir
                  </th>
                  <th className="py-2 text-right font-medium">Cek</th>
                </tr>
              </thead>
              <tbody>
                {w.weeks.map((x) => (
                  <tr
                    key={x.weekStart}
                    className="border-b border-white/5 text-neutral-300"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {weekLabel(x.weekStart)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {x.opening != null ? rp(x.opening) : "-"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rpSigned(x.orderIncome)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rpSigned(x.adjustments)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rpSigned(x.adTopups)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rpSigned(x.withdrawals)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {x.closing != null ? rp(x.closing) : "-"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {Math.abs(x.checkDiff) <= 0.5 ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-amber-300">
                          {rpSigned(x.checkDiff)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-600 mt-3">
            Minggu penuh yang beririsan dengan rentang. Angka mingguan tidak
            dipotong mengikuti tanggal awal dan akhir.
          </p>
        </Card>
      )}

      <Card
        title="Penarikan dana"
        subtitle={
          w.withdrawalList.length > 0
            ? `${w.withdrawalList.length} penarikan · ${rp(Math.abs(w.withdrawals))}`
            : "Tidak ada penarikan pada rentang ini"
        }
      >
        {w.withdrawalList.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-white/10">
                  <th className="py-2 pr-3 font-medium">Waktu (WIB)</th>
                  <th className="py-2 pr-3 text-right font-medium">Jumlah</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">
                    Saldo sesudahnya
                  </th>
                </tr>
              </thead>
              <tbody>
                {w.withdrawalList.map((x, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/5 text-neutral-300"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtDateTime(x.txnAt)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rp(Math.abs(x.amount))}
                    </td>
                    <td className="py-2 pr-3">{x.status ?? "-"}</td>
                    <td className="py-2 text-right tabular-nums">
                      {rp(x.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Kecocokan dana"
        subtitle="Dana yang dilepas menurut file penghasilan dibandingkan dengan yang masuk ke saldo, pesanan per pesanan"
      >
        {rec.summary.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Tidak ada pesanan yang bisa dicocokkan pada rentang ini.
          </p>
        ) : (
          <>
            <div
              className={`rounded-lg border px-4 py-3 text-sm mb-4 flex items-start gap-2 ${
                problemN === 0
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-200"
              }`}
            >
              {problemN === 0 ? (
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              )}
              <span>
                {problemN === 0
                  ? `Semua ${matchedN.toLocaleString("id-ID")} pesanan cocok: dana yang dilepas sama dengan yang masuk ke saldo.`
                  : `${problemN.toLocaleString("id-ID")} pesanan tidak cocok, ${matchedN.toLocaleString("id-ID")} cocok. Periksa daftar di bawah.`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-white/10">
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Pesanan
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Menurut penghasilan
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Menurut saldo
                    </th>
                    <th className="py-2 text-right font-medium">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.summary.map((s) => (
                    <tr
                      key={s.status}
                      className="border-b border-white/5 text-neutral-300"
                    >
                      <td className="py-2 pr-3">
                        {RECON_LABEL[s.status] ?? s.status}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {s.orders.toLocaleString("id-ID")}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {rpSigned(s.incomeSum)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {rpSigned(s.walletSum)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {rpSigned(s.diff)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rec.rows.length > 0 && (
              <div className="overflow-x-auto mt-5">
                <p className="text-xs text-neutral-400 font-medium mb-2">
                  Pesanan yang tidak cocok (selisih terbesar dulu)
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-neutral-500 border-b border-white/10">
                      <th className="py-2 pr-3 font-medium">No. Pesanan</th>
                      <th className="py-2 pr-3 font-medium">Tanggal</th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Penghasilan
                      </th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Saldo
                      </th>
                      <th className="py-2 pr-3 text-right font-medium">
                        Selisih
                      </th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.rows.map((r) => (
                      <tr
                        key={r.orderNo}
                        className="border-b border-white/5 text-neutral-300"
                      >
                        <td className="py-2 pr-3 font-mono">{r.orderNo}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {fmtDate(r.releasedOn ?? r.txnOn ?? "1970-01-01")}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {r.income != null ? rpSigned(r.income) : "-"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {r.walletAmount != null
                            ? rpSigned(r.walletAmount)
                            : "-"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-amber-300">
                          {rpSigned(r.diff)}
                        </td>
                        <td className="py-2">
                          {RECON_LABEL[r.status] ?? r.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rec.truncated && (
                  <p className="text-[11px] text-neutral-500 mt-2">
                    Hanya 200 baris dengan selisih terbesar yang ditampilkan.
                  </p>
                )}
              </div>
            )}
            <p className="text-[11px] text-neutral-600 mt-4">
              Pencocokan hanya berarti kalau file penghasilan dan file saldo
              sama-sama sudah diupload untuk seluruh rentang. Kalau salah
              satunya belum, pesanan di sisi yang belum muncul akan tampil
              sebagai tidak cocok.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

export default function SaldoTab({
  dana,
  currentUser,
}: {
  dana: DanaState;
  currentUser: string;
}) {
  return (
    <DanaShell dana={dana} currentUser={currentUser}>
      {(d) => <View d={d} />}
    </DanaShell>
  );
}
