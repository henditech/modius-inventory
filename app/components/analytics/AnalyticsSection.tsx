"use client";

import { useState } from "react";
import UploadTab from "./UploadTab";
import PenghasilanTab from "./PenghasilanTab";
import SaldoTab from "./SaldoTab";
import PanelTab from "./PanelTab";
import IklanTab from "./IklanTab";
import PesananTab from "./PesananTab";
import HargaTab from "./HargaTab";
import TtPenghasilanTab from "./TtPenghasilanTab";
import TtIklanTab from "./TtIklanTab";
import TtPesananTab from "./TtPesananTab";
import TtSaldoTab from "./TtSaldoTab";
import { useDana } from "./useDana";

type Market = "shopee" | "tiktok";
const MARKETS: { id: Market; label: string }[] = [
  { id: "shopee", label: "Shopee" },
  { id: "tiktok", label: "TikTok Shop" },
];

// Halaman Upload dipakai bersama (satu halaman untuk file Shopee dan TikTok). Tab TikTok lain
// (Pesanan, Iklan, Panel) ditambahkan di sini satu per satu begitu halamannya siap.
const SHOPEE_TABS = [
  { id: "upload", label: "Upload" },
  { id: "penghasilan", label: "Penghasilan" },
  { id: "saldo", label: "Saldo" },
  { id: "panel", label: "Panel" },
  { id: "iklan", label: "Iklan" },
  { id: "pesanan", label: "Pesanan" },
  { id: "harga", label: "Harga" },
] as const;
const TIKTOK_TABS = [
  { id: "upload", label: "Upload" },
  { id: "tt_penghasilan", label: "Penghasilan" },
  { id: "tt_iklan", label: "Iklan" },
  { id: "tt_pesanan", label: "Pesanan" },
  { id: "tt_saldo", label: "Saldo" },
] as const;
type TabId =
  | (typeof SHOPEE_TABS)[number]["id"]
  | (typeof TIKTOK_TABS)[number]["id"];

export default function AnalyticsSection({
  currentUser,
}: {
  currentUser: string;
}) {
  const [market, setMarket] = useState<Market>("shopee");
  const [tab, setTab] = useState<TabId>("upload");
  // Tab Penghasilan dan Saldo (Shopee) berbagi pilihan toko dan rentang tanggal; data baru
  // dimuat begitu salah satunya dibuka. Tab Panel punya pilihan toko dan periode sendiri.
  const usesDana =
    market === "shopee" && (tab === "penghasilan" || tab === "saldo");
  const dana = useDana(usesDana);

  const tabs: readonly { id: TabId; label: string }[] =
    market === "shopee" ? SHOPEE_TABS : TIKTOK_TABS;

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-2 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Analytics
      </h2>
      <p className="text-sm text-neutral-500 mb-4">
        Data marketplace per toko. Yang tampil hanya toko yang kamu kelola.
      </p>

      <div className="flex gap-2 mb-4">
        {MARKETS.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              if (m.id === market) return;
              setMarket(m.id);
              setTab("upload");
            }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              market === m.id
                ? "border-accent-500/50 text-accent-400 bg-accent-500/10"
                : "border-line text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-6 border-b border-line overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (
                market === "shopee" &&
                (t.id === "penghasilan" || t.id === "saldo")
              )
                dana.reload(); // data bisa berubah sesudah upload
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 ${
              tab === t.id
                ? "border-accent-400 text-accent-400"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "upload" && <UploadTab currentUser={currentUser} />}
      {market === "shopee" && tab === "penghasilan" && (
        <PenghasilanTab dana={dana} currentUser={currentUser} />
      )}
      {market === "shopee" && tab === "saldo" && (
        <SaldoTab dana={dana} currentUser={currentUser} />
      )}
      {market === "shopee" && tab === "panel" && (
        <PanelTab currentUser={currentUser} />
      )}
      {market === "shopee" && tab === "iklan" && (
        <IklanTab currentUser={currentUser} />
      )}
      {market === "shopee" && tab === "pesanan" && (
        <PesananTab currentUser={currentUser} />
      )}
      {market === "shopee" && tab === "harga" && (
        <HargaTab currentUser={currentUser} />
      )}
      {market === "tiktok" && tab === "tt_penghasilan" && (
        <TtPenghasilanTab currentUser={currentUser} />
      )}
      {market === "tiktok" && tab === "tt_iklan" && (
        <TtIklanTab currentUser={currentUser} />
      )}
      {market === "tiktok" && tab === "tt_pesanan" && (
        <TtPesananTab currentUser={currentUser} />
      )}
      {market === "tiktok" && tab === "tt_saldo" && (
        <TtSaldoTab currentUser={currentUser} />
      )}
    </div>
  );
}
