"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ShieldCheck,
  Wallet,
  Undo2,
  Database,
  Package,
  Store,
  Hash,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  TrendingUp,
  Flame,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { supabase } from "@/lib/supabase";

type Section = "overview" | "qc" | "sales" | "returns" | "master";
type AdminUser = "Hendi" | "Gita";

const AVATARS: Record<string, string> = {
  Hendi: "/avatars/hendi.png",
  Gita: "/avatars/gita.png",
};

const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "qc", label: "QC Checkpoint", icon: ShieldCheck },
  { id: "sales", label: "Catat Penjualan", icon: Wallet },
  { id: "returns", label: "Catat Retur", icon: Undo2 },
  { id: "master", label: "Kelola Master Data", icon: Database },
];

type FlashType = "success" | "warning" | "error";
type FlashMessage = { text: string; type: FlashType };

const FLASH_STYLES: Record<FlashType, { icon: LucideIcon; classes: string }> = {
  success: {
    icon: CheckCircle2,
    classes: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  },
  warning: {
    icon: AlertTriangle,
    classes: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  error: {
    icon: XCircle,
    classes: "bg-red-500/10 border-red-500/20 text-red-400",
  },
};

function StatusBanner({ message }: { message: FlashMessage | null }) {
  if (!message) return null;
  const { icon: Icon, classes } = FLASH_STYLES[message.type];
  return (
    <div
      className={`mb-4 p-3 rounded-lg border text-sm font-medium flex items-center gap-2 ${classes}`}
    >
      <Icon size={16} strokeWidth={2} className="shrink-0" />
      {message.text}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-neutral-500 font-medium">{label}</span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}1A` }}
        >
          <Icon size={16} strokeWidth={2} style={{ color: accent }} />
        </div>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#0a0b0e",
    border: "1px solid #23262e",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#8b93a1" },
};

type PendingBatch = {
  id: string;
  quantity: number;
  created_by: string | null;
  created_at: string;
  product_full_name: string;
};

function QcCheckpointSection({
  currentUser,
  onCountChange,
}: {
  currentUser: string;
  onCountChange?: (n: number) => void;
}) {
  const [batches, setBatches] = useState<PendingBatch[]>([]);
  const [passedInputs, setPassedInputs] = useState<
    Record<string, number | string>
  >({});
  const [defectInputs, setDefectInputs] = useState<
    Record<string, number | string>
  >({});
  const [message, setMessage] = useState<FlashMessage | null>(null);

  async function loadPendingBatches() {
    const { data: allBatches } = await supabase
      .from("production_batches")
      .select("id, quantity, created_by, created_at, products(full_name)")
      .order("created_at", { ascending: false });
    const { data: checkedBatches } = await supabase
      .from("qc_checks")
      .select("batch_id");
    const checkedIds = new Set((checkedBatches ?? []).map((c) => c.batch_id));
    const pending = (allBatches ?? [])
      .filter((b: any) => !checkedIds.has(b.id))
      .map((b: any) => ({
        id: b.id,
        quantity: b.quantity,
        created_by: b.created_by,
        created_at: b.created_at,
        product_full_name: b.products?.full_name ?? "(produk tidak ditemukan)",
      }));
    setBatches(pending);
    onCountChange?.(pending.length);
  }

  useEffect(() => {
    loadPendingBatches();
  }, []);

  function flash(text: string, type: FlashType = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  }

  async function handleSubmitQc(batch: PendingBatch) {
    const passed = Number(passedInputs[batch.id] || 0);
    const defect = Number(defectInputs[batch.id] || 0);

    if (passed + defect !== batch.quantity) {
      flash(`Total harus ${batch.quantity} (lolos + cacat)`, "warning");
      return;
    }
    await supabase.from("qc_checks").insert({
      batch_id: batch.id,
      passed_qty: passed,
      defect_qty: defect,
      checked_by: currentUser,
    });

    const { data: batchData } = await supabase
      .from("production_batches")
      .select("product_id")
      .eq("id", batch.id)
      .single();
    const productId = batchData?.product_id;
    if (productId) {
      const { data: existingStock } = await supabase
        .from("stock")
        .select("available_qty")
        .eq("product_id", productId)
        .maybeSingle();
      if (existingStock) {
        await supabase
          .from("stock")
          .update({
            available_qty: existingStock.available_qty + passed,
            updated_at: new Date().toISOString(),
          })
          .eq("product_id", productId);
      } else {
        await supabase.from("stock").insert({
          product_id: productId,
          available_qty: passed,
        });
      }
    }
    flash("QC tersimpan, stok terupdate!", "success");
    setPassedInputs((prev) => ({ ...prev, [batch.id]: 0 }));
    setDefectInputs((prev) => ({ ...prev, [batch.id]: 0 }));
    loadPendingBatches();
  }

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-2 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        QC Checkpoint
      </h2>
      <p className="text-sm text-neutral-500 mb-6">
        {batches.length} batch menunggu pengecekan
      </p>

      <StatusBanner message={message} />

      <div className="space-y-3">
        {batches.map((batch) => (
          <div
            key={batch.id}
            className="shine-surface group bg-panel border border-line rounded-xl p-4 hover:border-accent-500/50 transition-colors duration-300"
          >
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="font-medium text-neutral-100">
                  {batch.product_full_name}
                </p>
                <p className="text-sm text-neutral-500">
                  Diproduksi:{" "}
                  <span className="text-neutral-300 font-medium tabular-nums">
                    {batch.quantity} pcs
                  </span>{" "}
                  oleh{" "}
                  <span className="text-neutral-300">
                    {batch.created_by ?? "?"}
                  </span>{" "}
                  — {new Date(batch.created_at).toLocaleDateString("id-ID")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="text-xs text-emerald-400/90 mb-1 block font-medium">
                  Lolos
                </label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-24 bg-black/40 border border-line rounded-lg px-3 py-2 text-center focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  value={passedInputs[batch.id] || ""}
                  onChange={(e) =>
                    setPassedInputs((prev) => ({
                      ...prev,
                      [batch.id]: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-xs text-red-400/90 mb-1 block font-medium">
                  Cacat
                </label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-24 bg-black/40 border border-line rounded-lg px-3 py-2 text-center focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                  value={defectInputs[batch.id] || ""}
                  onChange={(e) =>
                    setDefectInputs((prev) => ({
                      ...prev,
                      [batch.id]: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <button
                onClick={() => handleSubmitQc(batch)}
                className="shine-btn mt-5 bg-accent-500 hover:bg-accent-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors duration-300 active:scale-95"
              >
                Simpan QC
              </button>
            </div>
          </div>
        ))}
        {batches.length === 0 && (
          <div className="text-center py-10 text-neutral-500">
            <CheckCircle2
              size={32}
              strokeWidth={1.5}
              className="mx-auto mb-2 text-emerald-400/80"
            />
            <p>Tidak ada batch yang menunggu QC</p>
          </div>
        )}
      </div>
    </div>
  );
}

type ProductOption = {
  id: string;
  full_name: string;
  photo_url: string | null;
  stock_qty: number;
};
type StoreOption = {
  id: string;
  name: string;
  code: string;
  managed_by: string;
};

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function shiftDateStr(dateStr: string, deltaDays: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().split("T")[0];
}

function shortLabel(isoStr: string) {
  const d = new Date(`${isoStr}T00:00:00`);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function formatFullDate(isoStr: string) {
  return new Date(`${isoStr}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StoreSelect({
  stores,
  value,
  onChange,
}: {
  stores: StoreOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = stores.find((s) => s.id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm text-left hover:border-neutral-500 transition-colors"
      >
        <span className={selected ? "text-neutral-100" : "text-neutral-500"}>
          {selected ? `${selected.name} (${selected.code})` : "Pilih toko"}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`text-neutral-500 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 bg-panel border border-line rounded-lg overflow-hidden z-20 max-h-56 overflow-y-auto">
          {stores.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-neutral-500">
              Tidak ada toko
            </p>
          )}
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onChange(s.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                s.id === value
                  ? "bg-white/10 text-neutral-50"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
              }`}
            >
              {s.name} <span className="text-neutral-500">({s.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CatatPenjualanSection({ currentUser }: { currentUser: string }) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const [historyDate, setHistoryDate] = useState(todayStr());
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [transactionDate, setTransactionDate] = useState(todayStr());

  async function loadProductsAndStores() {
    // Dibaca dari view product_available_stock, bukan tabel stock mentah --
    // supaya produk tipe "tempel" (topi polos + pin) juga tampil dengan
    // angka stok yang benar (dihitung dari stok komponennya), bukan 0/stale.
    const { data: productData } = await supabase
      .from("product_available_stock")
      .select("product_id, full_name, photo_url, available_qty")
      .eq("is_active", true)
      .order("full_name");
    if (productData) {
      setProducts(
        productData.map((p: any) => ({
          id: p.product_id,
          full_name: p.full_name,
          photo_url: p.photo_url,
          stock_qty: p.available_qty ?? 0,
        })),
      );
    }

    const { data: storeData } = await supabase
      .from("stores")
      .select("id, name, code, managed_by")
      .order("code");
    if (storeData) setStores(storeData);
  }

  async function loadSalesHistory(date: string) {
    const start = `${date}T00:00:00`;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const end = `${nextDay.toISOString().split("T")[0]}T00:00:00`;

    const { data: salesData } = await supabase
      .from("sales")
      .select("quantity, sold_at, sold_by, products(full_name), stores(code)")
      .gte("sold_at", start)
      .lt("sold_at", end)
      .order("sold_at", { ascending: false });
    setSalesHistory(salesData ?? []);
  }

  useEffect(() => {
    loadProductsAndStores();
  }, []);

  useEffect(() => {
    loadSalesHistory(historyDate);
  }, [historyDate]);

  function flash(text: string, type: FlashType = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  }

  async function handleSave() {
    if (!selectedProduct || !selectedStore || quantity <= 0) {
      flash("Pilih toko, produk, dan jumlah dulu", "warning");
      return;
    }

    const productData = products.find((p) => p.id === selectedProduct);
    if (!productData || productData.stock_qty < quantity) {
      flash("Stok tidak cukup!", "error");
      return;
    }

    // Cukup catat transaksi penjualannya di sini. Pengurangan stok produk,
    // pin (untuk produk tempel), dan SEMUA bahan pelengkap sudah ditangani
    // otomatis oleh trigger database begitu baris sales ini masuk --
    // jangan duplikasi logika pengurangan stok manual di sini lagi.
    const { error } = await supabase.from("sales").insert({
      product_id: selectedProduct,
      store_id: selectedStore,
      quantity,
      sold_by: currentUser,
      sold_at: `${transactionDate}T12:00:00`,
    });

    if (error) {
      flash("Gagal simpan, coba lagi", "error");
      return;
    }

    flash("Penjualan tersimpan!", "success");
    setQuantity(0);
    setSelectedProduct("");
    loadProductsAndStores();
    setTransactionDate(todayStr());
    if (historyDate === transactionDate) loadSalesHistory(historyDate);
  }

  const selectedProductData = products.find((p) => p.id === selectedProduct);
  const isToday = historyDate === todayStr();
  const myStores = stores.filter((s: any) => s.managed_by === currentUser);
  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Catat Penjualan
      </h2>

      <StatusBanner message={message} />

      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
        {/* KIRI: form + grid produk */}
        <div>
          <div className="bg-panel border border-line rounded-xl p-5 mb-6 flex items-end gap-4 flex-wrap">
            <div className="min-w-[180px]">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
                <Store
                  size={13}
                  strokeWidth={1.75}
                  className="text-neutral-500"
                />
                Toko
              </label>
              <StoreSelect
                stores={myStores}
                value={selectedStore}
                onChange={setSelectedStore}
              />
            </div>

            <div className="w-36">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium">
                Tanggal
              </label>
              <input
                type="date"
                value={transactionDate}
                max={todayStr()}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full bg-black/40 border border-accent-500/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>

            <div className="min-w-[180px] flex-1">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
                <Package
                  size={13}
                  strokeWidth={1.75}
                  className="text-neutral-500"
                />
                Produk dipilih
              </label>
              <div className="bg-black/20 border border-line/60 rounded-lg px-3 py-2.5 text-sm text-neutral-300 truncate">
                {selectedProductData
                  ? selectedProductData.full_name
                  : "— klik foto di bawah —"}
              </div>
            </div>

            <div className="w-24">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
                <Hash
                  size={13}
                  strokeWidth={1.75}
                  className="text-neutral-500"
                />
                Jumlah
              </label>
              <input
                type="number"
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
              />
            </div>

            <button
              onClick={handleSave}
              className="shine-btn bg-accent-500 hover:bg-accent-400 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors duration-300 active:scale-95 whitespace-nowrap"
            >
              Simpan Penjualan
            </button>
          </div>

          <label className="text-sm text-neutral-300 mb-3 font-medium flex items-center gap-1.5">
            <Package
              size={15}
              strokeWidth={1.75}
              className="text-neutral-500"
            />
            Pilih Produk
          </label>
          <div className="max-h-[62vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-4 gap-3">
              {products.map((p) => {
                const isSelected = selectedProduct === p.id;
                return (
                  <div key={p.id} className="group relative">
                    <div className="absolute -inset-1.5 rounded-2xl bg-white/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <button
                      onClick={() => setSelectedProduct(p.id)}
                      className={`relative w-full text-left bg-panel border rounded-xl overflow-hidden transition-all duration-300 group-hover:-translate-y-0.5 ${
                        isSelected
                          ? "border-accent-500 ring-2 ring-accent-500/40"
                          : "border-line group-hover:border-neutral-500"
                      }`}
                    >
                      {p.photo_url && (
                        <img
                          src={p.photo_url}
                          alt={p.full_name}
                          className="w-full aspect-video object-cover"
                        />
                      )}
                      <div className="p-2">
                        <p className="text-xs text-neutral-300 truncate">
                          {p.full_name}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {p.stock_qty} pcs
                        </p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* KANAN: riwayat penjualan + kalender */}
        <div className="bg-panel border border-line rounded-xl p-4 sticky top-20">
          <h3 className="text-sm tracking-wide text-neutral-300 font-medium mb-3 flex items-center gap-1.5">
            <ClipboardList size={15} strokeWidth={1.75} />
            {isToday ? "Penjualan Hari Ini" : "Penjualan"}
          </h3>

          <input
            type="date"
            value={historyDate}
            max={todayStr()}
            onChange={(e) => setHistoryDate(e.target.value)}
            className="w-full bg-black/40 border border-accent-500/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />

          {salesHistory.length > 0 && (
            <div className="bg-accent-500/10 border border-accent-500/20 rounded-lg px-3 py-2 mb-3 text-xs text-neutral-300">
              <span className="text-accent-400 font-semibold tabular-nums">
                {salesHistory.reduce((sum, s) => sum + s.quantity, 0)} pcs
              </span>{" "}
              stok berkurang dari {salesHistory.length} transaksi
            </div>
          )}

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {salesHistory.map((s, i) => (
              <div
                key={i}
                className="bg-black/20 border border-line/60 rounded-lg px-3 py-2.5 text-xs"
              >
                <p className="text-neutral-200 truncate">
                  {s.products?.full_name}
                </p>
                <div className="mt-1 text-neutral-500">
                  <span className="text-neutral-300 font-medium">
                    {s.quantity} pcs
                  </span>{" "}
                  ({s.stores?.code})
                </div>
              </div>
            ))}
            {salesHistory.length === 0 && (
              <p className="text-neutral-500 text-sm text-center py-6">
                Belum ada penjualan{isToday ? " hari ini" : " di tanggal ini"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ADMIN_USERS: AdminUser[] = ["Hendi", "Gita"];

function UserSwitcher({
  currentUser,
  onChange,
}: {
  currentUser: AdminUser;
  onChange: (u: AdminUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-1.5 pr-2.5 py-1.5 rounded-lg border border-line hover:border-neutral-600 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-accent-500/15 text-accent-400 text-xs font-semibold flex items-center justify-center shrink-0">
          {currentUser[0]}
        </span>
        <span className="text-left leading-tight">
          <span className="block text-sm font-medium text-neutral-100">
            {currentUser}
          </span>
          <span className="block text-[11px] text-neutral-500 mt-0.5">
            Administrator
          </span>
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`text-neutral-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="shine-surface absolute right-0 mt-1.5 w-44 bg-panel border border-line rounded-lg overflow-hidden z-20">
          {ADMIN_USERS.map((u) => (
            <button
              key={u}
              onClick={() => {
                onChange(u);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                u === currentUser
                  ? "bg-accent-500/10 text-neutral-50"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-accent-500/15 text-accent-400 text-[11px] font-semibold flex items-center justify-center shrink-0">
                {u[0]}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="font-medium">{u}</span>
                <span className="text-[10px] text-neutral-500">
                  Administrator
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CatatReturSection({ currentUser }: { currentUser: string }) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const [historyDate, setHistoryDate] = useState(todayStr());
  const [returnsHistory, setReturnsHistory] = useState<any[]>([]);
  const [transactionDate, setTransactionDate] = useState(todayStr());

  async function loadProductsAndStores() {
    const { data: productData } = await supabase
      .from("products")
      .select("id, full_name, photo_url, stock(available_qty)")
      .eq("is_active", true)
      .order("full_name");
    if (productData) {
      setProducts(
        productData.map((p: any) => {
          const stockRow = Array.isArray(p.stock) ? p.stock[0] : p.stock;
          return {
            id: p.id,
            full_name: p.full_name,
            photo_url: p.photo_url,
            stock_qty: stockRow?.available_qty ?? 0,
          };
        }),
      );
    }

    const { data: storeData } = await supabase
      .from("stores")
      .select("id, name, code, managed_by")
      .order("code");
    if (storeData) setStores(storeData);
  }

  async function loadReturnsHistory(date: string) {
    const start = `${date}T00:00:00`;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const end = `${nextDay.toISOString().split("T")[0]}T00:00:00`;

    const { data: returnsData } = await supabase
      .from("returns")
      .select(
        "quantity, reason, returned_at, products(full_name), stores(code)",
      )
      .gte("returned_at", start)
      .lt("returned_at", end)
      .order("returned_at", { ascending: false });
    setReturnsHistory(returnsData ?? []);
  }

  useEffect(() => {
    loadProductsAndStores();
  }, []);

  useEffect(() => {
    loadReturnsHistory(historyDate);
  }, [historyDate]);

  function flash(text: string, type: FlashType = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  }

  async function handleSave() {
    if (!selectedProduct || !selectedStore || quantity <= 0) {
      flash("Pilih toko, produk, dan jumlah dulu", "warning");
      return;
    }

    await supabase.from("returns").insert({
      product_id: selectedProduct,
      store_id: selectedStore,
      quantity,
      reason: reason || null,
      returned_at: `${transactionDate}T12:00:00`,
    });

    const { data: stockRow } = await supabase
      .from("stock")
      .select("available_qty")
      .eq("product_id", selectedProduct)
      .maybeSingle();

    if (stockRow) {
      await supabase
        .from("stock")
        .update({
          available_qty: stockRow.available_qty + quantity,
          updated_at: new Date().toISOString(),
        })
        .eq("product_id", selectedProduct);
    } else {
      await supabase.from("stock").insert({
        product_id: selectedProduct,
        available_qty: quantity,
      });
    }

    flash("Retur tersimpan, stok ditambah!", "success");
    setQuantity(0);
    setReason("");
    setSelectedProduct("");
    loadProductsAndStores();
    setTransactionDate(todayStr());
    if (historyDate === transactionDate) loadReturnsHistory(historyDate);
  }

  const myStores = stores.filter((s: any) => s.managed_by === currentUser);
  const selectedProductData = products.find((p) => p.id === selectedProduct);
  const isToday = historyDate === todayStr();

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Catat Retur
      </h2>

      <StatusBanner message={message} />

      <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
        {/* KIRI: form + grid produk */}
        <div>
          <div className="bg-panel border border-line rounded-xl p-5 mb-6 flex items-end gap-4 flex-wrap">
            <div className="min-w-[180px]">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
                <Store
                  size={13}
                  strokeWidth={1.75}
                  className="text-neutral-500"
                />
                Toko
              </label>
              <StoreSelect
                stores={myStores}
                value={selectedStore}
                onChange={setSelectedStore}
              />
            </div>

            <div className="w-36">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium">
                Tanggal
              </label>
              <input
                type="date"
                value={transactionDate}
                max={todayStr()}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full bg-black/40 border border-accent-500/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>

            <div className="min-w-[160px]">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
                <Package
                  size={13}
                  strokeWidth={1.75}
                  className="text-neutral-500"
                />
                Produk dipilih
              </label>
              <div className="bg-black/20 border border-line/60 rounded-lg px-3 py-2.5 text-sm text-neutral-300 truncate">
                {selectedProductData
                  ? selectedProductData.full_name
                  : "— klik foto —"}
              </div>
            </div>

            <div className="w-24">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
                <Hash
                  size={13}
                  strokeWidth={1.75}
                  className="text-neutral-500"
                />
                Jumlah
              </label>
              <input
                type="number"
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
              />
            </div>

            <div className="min-w-[200px] flex-1">
              <label className="text-xs text-neutral-400 mb-1.5 font-medium">
                Alasan (opsional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="cth: salah warna, cacat"
                className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
              />
            </div>

            <button
              onClick={handleSave}
              className="shine-btn bg-accent-500 hover:bg-accent-400 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors duration-300 active:scale-95 whitespace-nowrap"
            >
              Simpan Retur
            </button>
          </div>

          <label className="text-sm text-neutral-300 mb-3 font-medium flex items-center gap-1.5">
            <Package
              size={15}
              strokeWidth={1.75}
              className="text-neutral-500"
            />
            Pilih Produk
          </label>
          <div className="max-h-[62vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-4 gap-3">
              {products.map((p) => {
                const isSelected = selectedProduct === p.id;
                return (
                  <div key={p.id} className="group relative">
                    <div className="absolute -inset-1.5 rounded-2xl bg-white/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    <button
                      onClick={() => setSelectedProduct(p.id)}
                      className={`relative w-full text-left bg-panel border rounded-xl overflow-hidden transition-all duration-300 group-hover:-translate-y-0.5 ${
                        isSelected
                          ? "border-accent-500 ring-2 ring-accent-500/40"
                          : "border-line group-hover:border-neutral-500"
                      }`}
                    >
                      {p.photo_url && (
                        <img
                          src={p.photo_url}
                          alt={p.full_name}
                          className="w-full aspect-video object-cover"
                        />
                      )}
                      <div className="p-2">
                        <p className="text-xs text-neutral-300 truncate">
                          {p.full_name}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {p.stock_qty} pcs
                        </p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* KANAN: riwayat retur + kalender */}
        <div className="bg-panel border border-line rounded-xl p-4 sticky top-20">
          <h3 className="text-sm tracking-wide text-neutral-300 font-medium mb-3 flex items-center gap-1.5">
            <ClipboardList size={15} strokeWidth={1.75} />
            {isToday ? "Retur Hari Ini" : "Retur"}
          </h3>

          <input
            type="date"
            value={historyDate}
            max={todayStr()}
            onChange={(e) => setHistoryDate(e.target.value)}
            className="w-full bg-black/40 border border-accent-500/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {returnsHistory.map((r, i) => (
              <div
                key={i}
                className="bg-black/20 border border-line/60 rounded-lg px-3 py-2.5 text-xs"
              >
                <p className="text-neutral-200 truncate">
                  {r.products?.full_name}
                </p>
                <div className="flex justify-between mt-1 text-neutral-500">
                  <span>
                    <span className="text-neutral-300 font-medium">
                      {r.quantity} pcs
                    </span>{" "}
                    ({r.stores?.code})
                  </span>
                </div>
                {r.reason && (
                  <p className="text-neutral-500 mt-1 italic">{r.reason}</p>
                )}
              </div>
            ))}
            {returnsHistory.length === 0 && (
              <p className="text-neutral-500 text-sm text-center py-6">
                Belum ada retur{isToday ? " hari ini" : " di tanggal ini"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  const [stockSummary, setStockSummary] = useState({
    aman: 0,
    menipis: 0,
    kritis: 0,
  });
  const [trend, setTrend] = useState<{ date: string; total: number }[]>([]);
  const [topProducts, setTopProducts] = useState<
    { name: string; qty: number }[]
  >([]);
  const [stockList, setStockList] = useState<
    { full_name: string; photo_url: string | null; qty: number }[]
  >([]);
  const [overviewDate, setOverviewDate] = useState(todayStr());
  const [salesLast7, setSalesLast7] = useState(0);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [storeHealth, setStoreHealth] = useState<
    {
      id: string;
      name: string;
      code: string;
      managed_by: string;
      current: number;
      previous: number;
      status: "kosong" | "turun" | "stabil" | "naik";
      changePct: number | null;
    }[]
  >([]);

  useEffect(() => {
    loadStockSummary();
  }, []);

  useEffect(() => {
    loadOverview(overviewDate);
  }, [overviewDate]);

  async function loadStockSummary() {
    // Dibaca dari view product_available_stock, bukan tabel stock mentah --
    // supaya produk tipe "tempel" ikut terhitung dengan angka yang benar.
    const { data: stockData } = await supabase
      .from("product_available_stock")
      .select("available_qty, full_name, photo_url")
      .eq("is_active", true);

    if (stockData) {
      let aman = 0,
        menipis = 0,
        kritis = 0;
      const list = stockData.map((s: any) => {
        const qty = s.available_qty ?? 0;
        if (qty <= 50) kritis++;
        else if (qty <= 100) menipis++;
        else aman++;
        return {
          full_name: s.full_name ?? "?",
          photo_url: s.photo_url ?? null,
          qty,
        };
      });
      setStockSummary({ aman, menipis, kritis });
      setStockList(list.sort((a, b) => a.qty - b.qty));
    }
  }

  async function loadOverview(referenceDateStr: string) {
    setLoadingTrend(true);
    const reference = new Date(`${referenceDateStr}T12:00:00`);

    // 1. Bangun 14 hari berturut-turut menggunakan Map (seperti Ibu Bos)
    const days: { key: string; label: string; total: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(reference);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days.push({ key, label: shortLabel(key), total: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));

    // 2. Tentukan rentang jam transaksi secara presisi
    const start = new Date(reference);
    start.setDate(start.getDate() - 13);
    start.setHours(0, 0, 0, 0);

    const end = new Date(reference);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    const { data: salesData } = await supabase
      .from("sales")
      .select(
        "quantity, sold_at, store_id, products(full_name), stores(name, code, managed_by)",
      )
      .gte("sold_at", start.toISOString())
      .lt("sold_at", end.toISOString());

    const { data: allStores } = await supabase
      .from("stores")
      .select("id, name, code, managed_by")
      .order("code");

    const sevenDaysAgo = new Date(reference);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    let last7Total = 0;
    const byProduct: Record<string, number> = {};
    const byStore: Record<string, { current: number; previous: number }> = {};

    (salesData ?? []).forEach((s: any) => {
      const dayKey = (s.sold_at as string).split("T")[0];
      const targetDay = dayMap.get(dayKey);
      if (targetDay) {
        targetDay.total += s.quantity;
      }

      const isCurrentPeriod = new Date(s.sold_at) >= sevenDaysAgo;
      if (isCurrentPeriod) {
        last7Total += s.quantity;
      }

      const name = s.products?.full_name ?? "?";
      byProduct[name] = (byProduct[name] || 0) + s.quantity;

      if (s.store_id) {
        if (!byStore[s.store_id])
          byStore[s.store_id] = { current: 0, previous: 0 };
        if (isCurrentPeriod) byStore[s.store_id].current += s.quantity;
        else byStore[s.store_id].previous += s.quantity;
      }
    });

    setTrend(days.map((d) => ({ date: d.key, total: d.total })));
    setSalesLast7(last7Total);

    const ranked = Object.entries(byProduct)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    setTopProducts(ranked);

    // Kesehatan toko: bandingkan 7 hari terakhir vs 7 hari sebelum itu,
    // per toko. Toko tanpa penjualan sama sekali tetap dimasukkan (bukan
    // cuma toko yang ada transaksinya) supaya kelihatan kalau ada toko
    // yang "diam" total -- itu justru yang paling perlu diperhatikan.
    const health = (allStores ?? []).map((store: any) => {
      const stat = byStore[store.id] ?? { current: 0, previous: 0 };
      let status: "kosong" | "turun" | "stabil" | "naik";
      let changePct: number | null;

      if (stat.current === 0 && stat.previous === 0) {
        status = "kosong";
        changePct = null;
      } else if (stat.previous === 0) {
        status = "naik";
        changePct = null; // baru mulai jual, belum ada pembanding
      } else {
        changePct = ((stat.current - stat.previous) / stat.previous) * 100;
        if (changePct <= -20) status = "turun";
        else if (changePct >= 20) status = "naik";
        else status = "stabil";
      }

      return {
        id: store.id,
        name: store.name,
        code: store.code,
        managed_by: store.managed_by,
        current: stat.current,
        previous: stat.previous,
        status,
        changePct,
      };
    });

    const statusPriority: Record<string, number> = {
      kosong: 0,
      turun: 1,
      stabil: 2,
      naik: 3,
    };
    health.sort((a, b) => {
      const p = statusPriority[a.status] - statusPriority[b.status];
      if (p !== 0) return p;
      return (a.changePct ?? 0) - (b.changePct ?? 0);
    });
    setStoreHealth(health);

    setLoadingTrend(false);
  }

  const maxTrend = Math.max(...trend.map((t) => t.total), 1);
  const needsProduction = stockSummary.kritis + stockSummary.menipis;
  const rangeDaysCount = trend.length;
  const isOverviewToday = overviewDate === todayStr();
  const storesNeedAttention = storeHealth.filter(
    (s) => s.status === "kosong" || s.status === "turun",
  ).length;

  const statusChartData = [
    { name: "Aman", value: stockSummary.aman, color: "#34d399" },
    { name: "Menipis", value: stockSummary.menipis, color: "#fbbf24" },
    { name: "Kritis", value: stockSummary.kritis, color: "#f87171" },
  ];

  const trendChartData = trend.map((t) => ({
    ...t,
    label: new Date(t.date).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
    }),
  }));

  const topProductsChartData = topProducts.map((p) => ({
    ...p,
    short: p.name.length > 26 ? p.name.slice(0, 24) + "…" : p.name,
  }));

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Overview
      </h2>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Package}
          label="Total Produk Dipantau"
          value={stockList.length}
          accent="#5b7fff"
        />
        <StatCard
          icon={AlertTriangle}
          label="Perlu Diproduksi"
          value={needsProduction}
          accent="#fbbf24"
        />
        <StatCard
          icon={TrendingUp}
          label={
            isOverviewToday
              ? "Terjual 7 Hari Terakhir"
              : `Terjual 7 Hari s.d. ${shortLabel(overviewDate)}`
          }
          value={`${salesLast7} pcs`}
          accent="#5b7fff"
        />
        <StatCard
          icon={AlertTriangle}
          label="Toko Perlu Perhatian"
          value={storesNeedAttention}
          accent="#f87171"
        />
      </div>

      {/* Filter tanggal: satu kalender acuan, sama seperti Panel Ibu Bos */}
      <div className="bg-panel border border-line rounded-xl p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-neutral-500">
          {isOverviewToday
            ? "Menampilkan data hingga hari ini"
            : `Menampilkan data hingga ${formatFullDate(overviewDate)}`}
          {loadingTrend && <span className="ml-2 text-xs">Memuat…</span>}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={overviewDate}
            max={todayStr()}
            onChange={(e) => setOverviewDate(e.target.value)}
            className="bg-black/40 border border-accent-500/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          />
          {!isOverviewToday && (
            <button
              onClick={() => setOverviewDate(todayStr())}
              className="text-xs text-accent-400 hover:underline px-2 py-2"
            >
              Hari ini
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4 mb-6">
        {/* Tren penjualan */}
        <div className="bg-panel border border-line rounded-xl p-5">
          <h3 className="text-sm font-medium text-neutral-400 mb-4">
            Tren Penjualan {rangeDaysCount} Hari Terakhir (gabungan semua toko)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
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
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  itemStyle={{ color: "#7c96ff" }}
                  formatter={(value) => [`${value} pcs`, "Terjual"]}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#5b7fff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status stok (donat) */}
        <div className="bg-panel border border-line rounded-xl p-5">
          <h3 className="text-sm font-medium text-neutral-400 mb-4">
            Status Stok
          </h3>
          <div className="relative h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="none"
                >
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-2xl font-semibold">{stockList.length}</p>
              <p className="text-xs text-neutral-500">Produk</p>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-3 flex-wrap">
            {statusChartData.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-neutral-500">{s.name}</span>
                <span className="font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        {/* Produk terlaris */}
        <div className="bg-panel border border-line rounded-xl p-5">
          <h3 className="text-sm font-medium text-neutral-400 mb-4 flex items-center gap-1.5">
            <Flame size={14} className="text-red-400" />
            Produk Terlaris ({rangeDaysCount} Hari Terakhir)
          </h3>
          {topProductsChartData.length === 0 ? (
            <p className="text-neutral-500 text-sm text-center py-8">
              Belum ada penjualan di periode ini
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topProductsChartData}
                  layout="vertical"
                  margin={{ left: 10 }}
                >
                  <XAxis
                    type="number"
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="short"
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={200}
                    tick={{ fill: "#e5e7eb" }}
                  />
                  <Tooltip
                    {...CHART_TOOLTIP_STYLE}
                    cursor={{ fill: "rgba(91,127,255,0.08)" }}
                    formatter={(value) => [`${value} pcs`, "Terjual"]}
                    labelFormatter={(_label, payload) =>
                      payload?.[0]?.payload?.name ?? ""
                    }
                  />
                  <Bar
                    dataKey="qty"
                    fill="#5b7fff"
                    radius={[0, 6, 6, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Daftar stok detail */}
        <div className="bg-panel border border-line rounded-xl p-5">
          <h3 className="text-sm font-medium text-neutral-400 mb-4">
            Daftar Stok
          </h3>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {stockList.map((s, i) => {
              const dot =
                s.qty <= 60
                  ? "bg-red-500"
                  : s.qty <= 120
                    ? "bg-amber-400"
                    : "bg-emerald-400";
              return (
                <div
                  key={i}
                  className="flex items-center gap-2.5 bg-black/20 border border-line/60 rounded-lg px-3 py-2"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`}
                  ></span>
                  <span className="text-xs text-neutral-300 truncate flex-1">
                    {s.full_name}
                  </span>
                  <span className="text-xs text-neutral-500 tabular-nums">
                    {s.qty} pcs
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Kesehatan Toko */}
      <div className="bg-panel border border-line rounded-xl p-5 mt-4">
        <h3 className="text-sm font-medium text-neutral-400 mb-1 flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-red-400" />
          Kesehatan Toko
        </h3>
        <p className="text-xs text-neutral-600 mb-4">
          Perbandingan 7 hari terakhir vs 7 hari sebelumnya, per toko. Toko
          dengan status "Kosong" atau "Turun" ditaruh paling atas.
        </p>
        {storeHealth.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-8">
            Belum ada data toko
          </p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {storeHealth.map((s) => {
              const statusStyles: Record<
                string,
                { label: string; dot: string; text: string }
              > = {
                kosong: {
                  label: "Kosong",
                  dot: "bg-red-500",
                  text: "text-red-400",
                },
                turun: {
                  label: "Turun",
                  dot: "bg-red-500",
                  text: "text-red-400",
                },
                stabil: {
                  label: "Stabil",
                  dot: "bg-amber-400",
                  text: "text-amber-400",
                },
                naik: {
                  label: "Naik",
                  dot: "bg-emerald-400",
                  text: "text-emerald-400",
                },
              };
              const style = statusStyles[s.status];
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 bg-black/20 border border-line/60 rounded-lg px-3.5 py-2.5"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`}
                  ></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-200 truncate">
                      {s.name}{" "}
                      <span className="text-neutral-600">({s.code})</span>
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      Dikelola {s.managed_by}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm tabular-nums text-neutral-200">
                      {s.current} pcs
                    </p>
                    <p className={`text-[11px] font-medium ${style.text}`}>
                      {s.status === "kosong" && "Belum ada penjualan"}
                      {s.status === "naik" &&
                        s.changePct === null &&
                        "Baru mulai jual"}
                      {s.changePct !== null &&
                        `${s.changePct > 0 ? "+" : ""}${s.changePct.toFixed(0)}% vs minggu lalu`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const MASTER_TABS = [
  { id: "model", label: "Model Topi", table: "hat_models" },
  { id: "material", label: "Bahan", table: "materials" },
  { id: "color", label: "Warna", table: "colors" },
  { id: "logo", label: "Logo", table: "logos" },
] as const;

type MasterTabId = (typeof MASTER_TABS)[number]["id"];

function MasterDataSection({ currentUser }: { currentUser: string }) {
  const [activeTab, setActiveTab] = useState<MasterTabId>("model");
  const [items, setItems] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<"bordir" | "tempel">("bordir");
  const [message, setMessage] = useState<FlashMessage | null>(null);

  const currentTab = MASTER_TABS.find((t) => t.id === activeTab)!;

  async function loadItems() {
    const { data } = await supabase
      .from(currentTab.table)
      .select("*")
      .order("name");
    setItems(data ?? []);
  }

  useEffect(() => {
    loadItems();
    setNewName("");
    setNewCode("");
  }, [activeTab]);

  function flash(text: string, type: FlashType = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  }

  async function handleAdd() {
    if (!newName.trim() || !newCode.trim()) {
      flash("Isi nama dan kode dulu", "warning");
      return;
    }

    const payload: any = {
      name: newName.trim(),
      code: newCode.trim().toUpperCase(),
    };
    if (activeTab === "logo") payload.type = newType;

    const { error } = await supabase.from(currentTab.table).insert(payload);

    if (error) {
      flash(
        error.message.toLowerCase().includes("duplicate")
          ? "Nama atau kode sudah dipakai"
          : "Gagal menambah, coba lagi",
        "error",
      );
      return;
    }

    flash(`${currentTab.label} baru ditambahkan!`, "success");
    setNewName("");
    setNewCode("");
    loadItems();
  }

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Kelola Master Data
      </h2>

      <StatusBanner message={message} />

      {/* Tab dimensi */}
      <div className="flex gap-2 mb-6">
        {MASTER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "bg-accent-500 text-white"
                : "bg-panel border border-line text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6 items-start">
        {/* Daftar item yang sudah ada */}
        <div>
          <h3 className="text-sm text-neutral-500 font-medium mb-3">
            {currentTab.label} yang sudah ada ({items.length})
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-panel border border-line rounded-lg px-3.5 py-3"
              >
                <p className="text-sm text-neutral-200 truncate">{item.name}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {item.code}
                  {item.type && (
                    <span className="ml-1.5 text-neutral-600">
                      · {item.type}
                    </span>
                  )}
                </p>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-neutral-500 text-sm col-span-3">
                Belum ada data
              </p>
            )}
          </div>
        </div>

        {/* Form tambah baru */}
        <div className="bg-panel border border-line rounded-xl p-5 sticky top-20">
          <h3 className="text-sm font-medium text-neutral-300 mb-4">
            Tambah {currentTab.label} Baru
          </h3>

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Nama
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="cth: Merah Marun"
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50"
          />

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Kode (3 huruf)
          </label>
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.slice(0, 4))}
            placeholder="cth: MRN"
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 uppercase focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50"
          />

          {activeTab === "logo" && (
            <>
              <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
                Jenis Logo
              </label>
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as "bordir" | "tempel")
                }
                className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500"
              >
                <option value="bordir">Bordir</option>
                <option value="tempel">Tempel (Pin Logam)</option>
              </select>
            </>
          )}

          <button
            onClick={handleAdd}
            className="shine-btn w-full bg-accent-500 hover:bg-accent-400 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors duration-300 active:scale-95 mt-1"
          >
            Tambah {currentTab.label}
          </button>

          <p className="text-[11px] text-neutral-600 mt-3">
            Ditambahkan oleh {currentUser}. Ingat diskusiin dulu sama tim
            sebelum nambah ya.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [qcPendingCount, setQcPendingCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("modiusUser");
    if (stored === "Hendi" || stored === "Gita") {
      setCurrentUser(stored);
    } else {
      router.push("/");
    }
  }, []);

  useEffect(() => {
    loadQcPendingCount();
  }, []);

  async function loadQcPendingCount() {
    const { data: allBatches } = await supabase
      .from("production_batches")
      .select("id");
    const { data: checkedBatches } = await supabase
      .from("qc_checks")
      .select("batch_id");
    const checkedIds = new Set((checkedBatches ?? []).map((c) => c.batch_id));
    const pending = (allBatches ?? []).filter((b) => !checkedIds.has(b.id));
    setQcPendingCount(pending.length);
  }

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-base text-neutral-100 font-[family-name:var(--font-inter)]">
      {/* Custom Styles: token warna, animasi masuk, dan efek kilau */}
      <style jsx global>{`
        :root {
          --bg-base: #0a0b0e;
          --bg-panel: #111318;
          --border-line: #23262e;
          --accent-400: #7c96ff;
          --accent-500: #5b7fff;
        }
        .bg-base {
          background-color: var(--bg-base);
        }
        .bg-panel {
          background-color: var(--bg-panel);
        }
        .border-line {
          border-color: var(--border-line);
        }
        .bg-accent-500 {
          background-color: var(--accent-500);
        }
        .hover\\:bg-accent-400:hover {
          background-color: var(--accent-400);
        }
        .text-accent-400 {
          color: var(--accent-400);
        }
        .bg-accent-400 {
          background-color: var(--accent-400);
        }
        .border-accent-500\\/50:hover,
        .hover\\:border-accent-500\\/50:hover {
          border-color: rgba(91, 127, 255, 0.5);
        }
        .focus\\:border-accent-500:focus {
          border-color: var(--accent-500);
        }
        .focus\\:ring-accent-500\\/50:focus {
          --tw-ring-color: rgba(91, 127, 255, 0.5);
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }

        /* Efek kilau 3D: sapuan cahaya diagonal saat hover */
        .shine-surface,
        .shine-btn {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .shine-surface::after,
        .shine-btn::after {
          content: "";
          position: absolute;
          top: 0;
          left: -60%;
          width: 40%;
          height: 100%;
          background: linear-gradient(
            115deg,
            transparent 20%,
            rgba(255, 255, 255, 0.06) 45%,
            rgba(255, 255, 255, 0.14) 50%,
            rgba(255, 255, 255, 0.06) 55%,
            transparent 80%
          );
          transform: skewX(-20deg);
          transition: left 0.85s cubic-bezier(0.19, 1, 0.22, 1);
          pointer-events: none;
          z-index: 1;
        }
        .shine-surface:hover::after,
        .shine-btn:hover::after {
          left: 130%;
        }
        .shine-btn::after {
          background: linear-gradient(
            115deg,
            transparent 20%,
            rgba(255, 255, 255, 0.1) 45%,
            rgba(255, 255, 255, 0.28) 50%,
            rgba(255, 255, 255, 0.1) 55%,
            transparent 80%
          );
        }
      `}</style>

      {/* Header */}
      <div className="bg-panel/80 backdrop-blur-sm border-b border-line px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-500"></span>
          Modius Admin
        </h1>
        <div className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-lg border border-line">
          <img
            src={AVATARS[currentUser]}
            alt={currentUser}
            className="w-7 h-7 rounded-full object-cover"
          />
          <span className="text-left leading-tight">
            <span className="block text-sm font-medium text-neutral-100">
              {currentUser}
            </span>
            <span className="block text-[11px] text-neutral-500">
              Administrator
            </span>
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar Navigasi */}
        <div className="w-60 bg-panel/50 border-r border-line min-h-[calc(100vh-65px)] p-4">
          <nav className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-r-lg text-sm font-medium transition-colors duration-200 flex items-center justify-between gap-2.5 border-l-2 ${
                    active
                      ? "bg-accent-500/10 text-neutral-50 border-accent-500"
                      : "text-neutral-500 border-transparent hover:bg-white/5 hover:text-neutral-200"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      size={18}
                      strokeWidth={1.75}
                      className={
                        active ? "text-accent-400" : "text-neutral-500"
                      }
                    />
                    {s.label}
                  </span>
                  {s.id === "qc" && qcPendingCount > 0 && (
                    <span className="bg-amber-500 text-black text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {qcPendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Konten */}
        <div className="flex-1 p-8">
          {activeSection === "overview" && <OverviewSection />}
          {activeSection === "qc" && (
            <QcCheckpointSection
              currentUser={currentUser}
              onCountChange={setQcPendingCount}
            />
          )}
          {activeSection === "sales" && (
            <CatatPenjualanSection currentUser={currentUser} />
          )}
          {activeSection === "returns" && (
            <CatatReturSection currentUser={currentUser} />
          )}
          {activeSection === "master" && (
            <MasterDataSection currentUser={currentUser} />
          )}
        </div>
      </div>
    </div>
  );
}
