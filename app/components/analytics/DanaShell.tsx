"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { DanaData } from "@/lib/analytics/dana";
import {
  PRESET_LABEL,
  presetRange,
  rangeWarnings,
  todayWib,
  type Preset,
} from "@/lib/analytics/danaRange";
import { fmtDate } from "@/lib/analytics/uploadView";
import type { DanaState } from "./useDana";

const PRESETS: Preset[] = ["7d", "30d", "thisMonth", "lastMonth", "all"];

const dateInputCls =
  "bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:cursor-pointer";

const covText = (label: string, a: string | null, b: string | null) =>
  a && b ? `${label}: ${fmtDate(a)} – ${fmtDate(b)}` : `${label}: belum ada`;

// Bilah pilihan toko + rentang tanggal, dan penanganan keadaan (memuat, kosong, galat, sesi).
export default function DanaShell({
  dana,
  currentUser,
  children,
}: {
  dana: DanaState;
  currentUser: string;
  children: (d: DanaData) => ReactNode;
}) {
  const router = useRouter();
  const { data, effectiveRange: r } = dana;

  if (dana.sessionExpired) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 text-sm text-amber-200 max-w-xl">
        <p className="flex items-center gap-2 font-medium mb-2">
          <AlertTriangle size={16} className="shrink-0" />
          Sesi login belum berlaku untuk Analytics
        </p>
        <p className="mb-4 text-amber-200/80">
          Keluar lalu masuk lagi dengan password kamu.
        </p>
        <button
          onClick={() => {
            sessionStorage.removeItem("modiusUser");
            router.push("/");
          }}
          className="bg-accent-500 hover:bg-accent-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Masuk lagi
        </button>
      </div>
    );
  }

  const warnings = r && data ? rangeWarnings(r, data.coverage) : [];

  return (
    <div>
      {dana.admin && dana.admin !== currentUser && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-sm text-amber-200">
          Sesi login di server atas nama {dana.admin}, sedangkan halaman ini
          menampilkan {currentUser}. Keluar lalu masuk lagi supaya sama.
        </div>
      )}

      <div className="bg-panel border border-line rounded-xl p-4 mb-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[220px]">
            <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
              Toko
            </label>
            <select
              value={dana.storeId}
              onChange={(e) => dana.setStoreId(e.target.value)}
              className="w-full bg-black/40 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
            >
              <option value="">— pilih toko —</option>
              {dana.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {r && (
            <>
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                  Dari
                </label>
                <input
                  type="date"
                  value={r.from}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) dana.setRange({ from: v, to: v > r.to ? v : r.to });
                  }}
                  className={dateInputCls}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                  Sampai
                </label>
                <input
                  type="date"
                  value={r.to}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v)
                      dana.setRange({ from: v < r.from ? v : r.from, to: v });
                  }}
                  className={dateInputCls}
                />
              </div>
            </>
          )}
          {dana.loading && (
            <Loader2
              size={16}
              className="animate-spin text-neutral-500 mb-2.5"
            />
          )}
        </div>

        {data && (
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  const next = presetRange(p, todayWib(), data.coverage);
                  if (next) dana.setRange(next);
                }}
                className="text-xs px-2.5 py-1 rounded-full border border-line text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
            {dana.range && (
              <button
                onClick={() => dana.setRange(null)}
                className="text-xs px-2.5 py-1 rounded-full border border-accent-500/40 text-accent-400 hover:bg-accent-500/10 transition-colors"
              >
                Otomatis (irisan data)
              </button>
            )}
          </div>
        )}

        {data && (
          <p className="text-[11px] text-neutral-500 mt-3">
            Data tersimpan ·{" "}
            {covText(
              "Penghasilan",
              data.coverage.incomeFirst,
              data.coverage.incomeLast,
            )}{" "}
            ·{" "}
            {covText(
              "Saldo",
              data.coverage.walletFirst,
              data.coverage.walletLast,
            )}{" "}
            ·{" "}
            {covText(
              "Pesanan",
              data.coverage.ordersFirst,
              data.coverage.ordersLast,
            )}
          </p>
        )}
        {warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {warnings.map((w, i) => (
              <li
                key={i}
                className="text-xs text-amber-300 flex items-start gap-1.5"
              >
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      {dana.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-300 mb-5">
          {dana.error}
        </div>
      )}

      {!dana.storeId ? (
        <p className="text-sm text-neutral-500">
          Pilih toko untuk melihat datanya.
        </p>
      ) : !data ? (
        dana.loading ? (
          <p className="text-sm text-neutral-500">Memuat…</p>
        ) : null
      ) : data.empty ? (
        <div className="bg-panel border border-line rounded-xl p-5 text-sm text-neutral-400">
          Belum ada data untuk toko ini. Upload dulu di tab Upload.
        </div>
      ) : (
        <div
          className={
            dana.loading
              ? "opacity-60 transition-opacity"
              : "transition-opacity"
          }
        >
          {children(data)}
        </div>
      )}
    </div>
  );
}
