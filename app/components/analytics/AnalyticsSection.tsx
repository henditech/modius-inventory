"use client";

import { useState } from "react";
import UploadTab from "./UploadTab";
import PenghasilanTab from "./PenghasilanTab";
import SaldoTab from "./SaldoTab";
import PanelTab from "./PanelTab";
import IklanTab from "./IklanTab";
import { useDana } from "./useDana";

// Tab lain (Pesanan, Iklan, Harga) ditambahkan di sini satu per satu begitu halamannya siap.
const TABS = [
  { id: "upload", label: "Upload" },
  { id: "penghasilan", label: "Penghasilan" },
  { id: "saldo", label: "Saldo" },
  { id: "panel", label: "Panel" },
  { id: "iklan", label: "Iklan" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AnalyticsSection({
  currentUser,
}: {
  currentUser: string;
}) {
  const [tab, setTab] = useState<TabId>("upload");
  // Tab Penghasilan dan Saldo berbagi pilihan toko dan rentang tanggal; data baru dimuat
  // begitu salah satunya dibuka. Tab Panel punya pilihan toko dan periode sendiri.
  const usesDana = tab === "penghasilan" || tab === "saldo";
  const dana = useDana(usesDana);

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-2 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Analytics
      </h2>
      <p className="text-sm text-neutral-500 mb-6">
        Data marketplace per toko. Yang tampil hanya toko yang kamu kelola.
      </p>

      <div className="flex gap-2 mb-6 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (t.id === "penghasilan" || t.id === "saldo") dana.reload(); // data bisa berubah sesudah upload
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
      {tab === "penghasilan" && (
        <PenghasilanTab dana={dana} currentUser={currentUser} />
      )}
      {tab === "saldo" && <SaldoTab dana={dana} currentUser={currentUser} />}
      {tab === "panel" && <PanelTab currentUser={currentUser} />}
      {tab === "iklan" && <IklanTab currentUser={currentUser} />}
    </div>
  );
}
