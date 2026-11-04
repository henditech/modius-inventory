"use client";

import { AlertTriangle } from "lucide-react";
import type { DanaData } from "@/lib/analytics/dana";
import { daysBetween } from "@/lib/analytics/danaRange";
import { fmtDate, fmtPct, rp } from "@/lib/analytics/uploadView";
import DanaShell from "./DanaShell";
import { Card, Stat } from "./ui";
import type { DanaState } from "./useDana";

function View({ d }: { d: DanaData }) {
  const inc = d.income;
  // subtotal di file Shopee sudah dikurangi refund; rincian di bawah dimulai dari harga produk kotor.
  const refund = inc.fees.find((f) => f.ord === 13)?.total ?? 0;
  const gross = inc.subtotal + refund;
  const totalCuts = inc.fees.reduce((a, f) => a + f.total, 0);
  const shown = inc.fees.filter((f) => Math.abs(f.total) >= 0.5);
  const pct = (n: number) =>
    gross > 0 ? fmtPct((Math.abs(n) / gross) * 100) : "-";

  const p = d.pending;
  const cov = d.coverage;
  const incomeBehind =
    cov.incomeLast &&
    cov.ordersLast &&
    daysBetween(cov.incomeLast, cov.ordersLast) > 3
      ? { income: cov.incomeLast, orders: cov.ordersLast }
      : null;

  return (
    <div className="space-y-5">
      {inc.lines === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Tidak ada dana yang dilepas pada rentang ini.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Stat
              label="Harga produk (sebelum refund)"
              value={rp(gross)}
              sub={`${inc.orders} pesanan dilepas`}
            />
            <Stat
              label="Total potongan"
              value={rp(totalCuts)}
              sub={`${pct(totalCuts)} dari harga produk`}
              tone="warn"
            />
            <Stat
              label="Dana dilepas"
              value={rp(inc.incomeSum)}
              sub={
                inc.incomePct != null
                  ? `${fmtPct(inc.incomePct)} dari subtotal pesanan (setelah refund)`
                  : undefined
              }
              tone="good"
            />
            <Stat
              label="Baris produk"
              value={inc.lines.toLocaleString("id-ID")}
              sub="satu pesanan bisa lebih dari satu produk"
            />
          </div>

          <Card
            title="Ke mana uang pergi"
            subtitle="Dari harga produk sampai dana yang benar-benar dilepas Shopee"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-200 font-medium">
                  Harga produk (sebelum refund)
                </span>
                <span className="tabular-nums text-neutral-50 font-semibold">
                  {rp(gross)}
                </span>
              </div>

              {shown.map((f) => {
                const subsidy = f.total < 0;
                const width =
                  gross > 0
                    ? Math.min(100, (Math.abs(f.total) / gross) * 100)
                    : 0;
                return (
                  <div key={f.ord}>
                    <div className="flex items-center justify-between gap-3 text-xs mb-1">
                      <span className="text-neutral-400 truncate">
                        {f.item}
                      </span>
                      <span className="tabular-nums shrink-0">
                        <span
                          className={
                            subsidy ? "text-emerald-400" : "text-neutral-200"
                          }
                        >
                          {subsidy ? "+" : "−"}
                          {rp(Math.abs(f.total))}
                        </span>
                        <span className="text-neutral-600 ml-2">
                          {pct(f.total)}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${subsidy ? "bg-emerald-400/80" : "bg-red-400/70"}`}
                        style={{ width: `${Math.max(width, 0.5)}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between text-sm border-t border-white/10 pt-3">
                <span className="text-neutral-200 font-medium">
                  Dana dilepas
                </span>
                <span className="tabular-nums text-emerald-400 font-semibold">
                  {rp(inc.incomeSum)}
                </span>
              </div>
              {Math.abs(inc.unexplained) >= 1 && (
                <p className="text-[11px] text-neutral-500">
                  Pemeriksaan komponen punya selisih kecil{" "}
                  {rp(Math.abs(inc.unexplained))} yang berasal dari file Shopee
                  sendiri, jadi total di atas bisa berbeda sebesar itu.
                </p>
              )}
            </div>
          </Card>
        </>
      )}

      <Card
        title="Dana menunggu cair"
        subtitle="Pesanan tidak batal yang belum ada di file penghasilan (di luar pilihan rentang tanggal)"
      >
        {p.orders === 0 ? (
          <p className="text-sm text-neutral-400">
            Tidak ada pesanan yang menunggu pencairan.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-x-6 gap-y-1 flex-wrap mb-4">
              <p className="text-xl font-semibold tabular-nums text-neutral-50">
                {p.orders.toLocaleString("id-ID")} pesanan
              </p>
              <p className="text-sm text-neutral-400 tabular-nums">
                nilai pesanan {rp(p.subtotal)}
              </p>
              {p.oldest && (
                <p className="text-xs text-neutral-500">
                  tertua dipesan {fmtDate(p.oldest)}
                </p>
              )}
            </div>
            {incomeBehind && (
              <p className="text-xs text-amber-300 flex items-start gap-1.5 mb-4">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                File penghasilan baru sampai {fmtDate(incomeBehind.income)},
                sedangkan pesanan sampai {fmtDate(incomeBehind.orders)}.
                Sebagian yang tampil menunggu mungkin hanya belum diupload.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-white/10">
                    <th className="py-2 pr-3 font-medium">No. Pesanan</th>
                    <th className="py-2 pr-3 font-medium">Dipesan</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.slice(0, 10).map((r) => (
                    <tr
                      key={r.orderNo}
                      className="border-b border-white/5 text-neutral-300"
                    >
                      <td className="py-2 pr-3 font-mono">{r.orderNo}</td>
                      <td className="py-2 pr-3">
                        {r.orderedOn ? fmtDate(r.orderedOn) : "-"}
                      </td>
                      <td className="py-2 pr-3">{r.status}</td>
                      <td className="py-2 text-right tabular-nums">
                        {rp(r.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p.orders > 10 && (
              <p className="text-[11px] text-neutral-500 mt-2">
                Menampilkan 10 pesanan terlama dari {p.orders}.
              </p>
            )}
            <p className="text-[11px] text-neutral-600 mt-3">
              Dihitung dari pesanan yang belum muncul di file penghasilan, jadi
              baru akurat kalau file penghasilan sudah diupload sampai tanggal
              terbaru.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

export default function PenghasilanTab({
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
