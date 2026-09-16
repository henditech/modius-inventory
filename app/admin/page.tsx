"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
  Menu,
  X,
  ImagePlus,
  Loader2,
  Search,
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

function CatatanPenjualanSection({ currentUser }: { currentUser: string }) {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(shiftDateStr(todayStr(), -7));
  const [dateTo, setDateTo] = useState(todayStr());
  const [storeFilter, setStoreFilter] = useState("");
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [copiedResi, setCopiedResi] = useState<string | null>(null);

  async function loadStores() {
    const { data: storeData } = await supabase
      .from("stores")
      .select("id, name, code, managed_by")
      .order("code");
    if (storeData) setStores(storeData);
  }

  async function loadSalesHistory() {
    setLoading(true);
    const start = `${dateFrom}T00:00:00`;
    const endDate = new Date(dateTo);
    endDate.setDate(endDate.getDate() + 1);
    const end = `${endDate.toISOString().split("T")[0]}T00:00:00`;

    const { data } = await supabase
      .from("sales")
      .select(
        "quantity, sold_at, sold_by, resi_number, products(full_name, photo_url), stores(code, name, managed_by)",
      )
      .gte("sold_at", start)
      .lt("sold_at", end)
      .order("sold_at", { ascending: false })
      .limit(limit);

    // Tiap admin cuma lihat penjualan dari toko yang dia kelola sendiri --
    // sama persis polanya kayak Overview & versi lama halaman ini.
    const scoped = (data ?? []).filter(
      (s: any) => s.stores?.managed_by === currentUser,
    );
    setSalesHistory(scoped);
    setLoading(false);
  }

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    loadSalesHistory();
  }, [dateFrom, dateTo, limit, currentUser]);

  function copyResi(resi: string) {
    navigator.clipboard.writeText(resi);
    setCopiedResi(resi);
    setTimeout(() => setCopiedResi(null), 1500);
  }

  const myStores = stores.filter((s: any) => s.managed_by === currentUser);

  const filteredHistory = salesHistory.filter((s) => {
    if (storeFilter && s.stores?.code !== storeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.resi_number ?? "").toLowerCase().includes(q) ||
      (s.products?.full_name ?? "").toLowerCase().includes(q)
    );
  });

  const totalQty = filteredHistory.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Catatan Penjualan
      </h2>

      {/* Search resi/produk -- elemen paling menonjol, sesuai use case utama */}
      <div className="relative mb-4">
        <Search
          size={16}
          strokeWidth={1.75}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor resi atau nama produk..."
          className="w-full bg-panel border border-line rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
        />
      </div>

      {/* Filter tanggal & toko */}
      <div className="bg-panel border border-line rounded-xl p-4 mb-4 flex items-end gap-4 flex-wrap">
        <div className="w-36">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium">
            Dari Tanggal
          </label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
          />
        </div>
        <div className="w-36">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium">
            Sampai Tanggal
          </label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={todayStr()}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="text-xs text-neutral-400 mb-1.5 font-medium flex items-center gap-1.5">
            <Store size={13} strokeWidth={1.75} className="text-neutral-500" />
            Toko
          </label>
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50 transition-all"
          >
            <option value="">Semua Toko Saya</option>
            {myStores.map((s: any) => (
              <option key={s.id} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredHistory.length > 0 && (
        <div className="bg-accent-500/10 border border-accent-500/20 rounded-lg px-4 py-2.5 mb-4 text-sm text-neutral-300">
          <span className="text-accent-400 font-semibold tabular-nums">
            {totalQty} pcs
          </span>{" "}
          dari {filteredHistory.length} transaksi
        </div>
      )}

      {/* List transaksi */}
      <div className="space-y-2">
        {filteredHistory.map((s, i) => (
          <div
            key={i}
            className="bg-panel border border-line rounded-xl p-3 flex items-center gap-3 hover:border-accent-500/50 transition-colors duration-200"
          >
            {s.products?.photo_url ? (
              <img
                src={s.products.photo_url}
                alt={s.products?.full_name}
                className="w-14 h-14 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-black/30 flex items-center justify-center shrink-0">
                <Package
                  size={18}
                  strokeWidth={1.5}
                  className="text-neutral-600"
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-100 truncate">
                {s.products?.full_name ?? "(produk tidak ditemukan)"}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
                <span className="text-neutral-300 font-medium">
                  {s.quantity} pcs
                </span>
                <span>·</span>
                <span>{s.stores?.code}</span>
                <span>·</span>
                <span>
                  {new Date(s.sold_at).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>

            <button
              onClick={() => s.resi_number && copyResi(s.resi_number)}
              className="shrink-0 text-right group"
              title="Klik untuk salin nomor resi"
            >
              <p className="text-[10px] text-neutral-500 group-hover:text-accent-400 transition-colors">
                {copiedResi === s.resi_number ? "Tersalin!" : "No. Resi"}
              </p>
              <p className="text-xs font-mono text-neutral-300 group-hover:text-accent-400 transition-colors">
                {s.resi_number ?? "-"}
              </p>
            </button>
          </div>
        ))}

        {!loading && filteredHistory.length === 0 && (
          <p className="text-neutral-500 text-sm text-center py-10">
            {search
              ? "Tidak ada transaksi yang cocok dengan pencarian"
              : "Belum ada penjualan di rentang tanggal ini"}
          </p>
        )}

        {loading && (
          <p className="text-neutral-500 text-sm text-center py-10 flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Memuat...
          </p>
        )}
      </div>

      {!loading && salesHistory.length === limit && (
        <button
          onClick={() => setLimit((l) => l + 50)}
          className="w-full mt-4 py-2.5 rounded-lg border border-line text-sm text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
        >
          Muat lebih banyak
        </button>
      )}
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
        <div className="bg-panel border border-line rounded-xl p-4 lg:sticky lg:top-20">
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

function OverviewSection({ currentUser }: { currentUser: string }) {
  const [stockSummary, setStockSummary] = useState({
    aman: 0,
    menipis: 0,
    kritis: 0,
  });
  const [trend, setTrend] = useState<{ date: string; total: number }[]>([]);
  const [topProducts, setTopProducts] = useState<
    {
      name: string;
      photo_url: string | null;
      qty: number;
      current: number;
      previous: number;
    }[]
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
  }, [overviewDate, currentUser]);

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

    // Sertakan products(id, full_name, photo_url) -- id dipakai buat
    // ngelompokkan penjualan per produk secara aman (bukan per nama teks),
    // photo_url dipakai buat tampilan ranking foto di Produk Terlaris.
    const { data: rawSalesData } = await supabase
      .from("sales")
      .select(
        "quantity, sold_at, store_id, products(id, full_name, photo_url), stores(name, code, managed_by)",
      )
      .gte("sold_at", start.toISOString())
      .lt("sold_at", end.toISOString());

    const { data: rawStores } = await supabase
      .from("stores")
      .select("id, name, code, managed_by")
      .order("code");

    // Overview di-scope per admin: masing-masing cuma lihat toko yang dia
    // kelola sendiri, biar fokus dan gak campur sama toko admin lain.
    // Filter ini jadi sumber tunggal untuk SEMUA ringkasan di bawah --
    // trend, produk terlaris, dan kesehatan toko -- karena semuanya
    // dihitung dari salesData & allStores yang sama-sama udah difilter
    // di sini, bukan dihitung ulang per bagian.
    const allStores = (rawStores ?? []).filter(
      (s: any) => s.managed_by === currentUser,
    );
    const salesData = (rawSalesData ?? []).filter(
      (s: any) => s.stores?.managed_by === currentUser,
    );

    const sevenDaysAgo = new Date(reference);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    let last7Total = 0;
    const byProduct: Record<
      string,
      {
        name: string;
        photo_url: string | null;
        qty: number;
        current: number;
        previous: number;
      }
    > = {};
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

      // Dikelompokkan per product_id (bukan per nama teks) -- lebih aman
      // kalau suatu saat ada 2 produk beda dengan nama yang kebetulan
      // sama/mirip. photo_url ikut disimpan sekali di sini, dan current
      // vs previous dihitung bareng qty total, dipakai buat badge "Naik".
      const productId = s.products?.id ?? "unknown";
      const name = s.products?.full_name ?? "?";
      const photoUrl = s.products?.photo_url ?? null;
      if (!byProduct[productId]) {
        byProduct[productId] = {
          name,
          photo_url: photoUrl,
          qty: 0,
          current: 0,
          previous: 0,
        };
      }
      byProduct[productId].qty += s.quantity;
      if (isCurrentPeriod) byProduct[productId].current += s.quantity;
      else byProduct[productId].previous += s.quantity;

      if (s.store_id) {
        if (!byStore[s.store_id])
          byStore[s.store_id] = { current: 0, previous: 0 };
        if (isCurrentPeriod) byStore[s.store_id].current += s.quantity;
        else byStore[s.store_id].previous += s.quantity;
      }
    });

    setTrend(days.map((d) => ({ date: d.key, total: d.total })));
    setSalesLast7(last7Total);

    const ranked = Object.values(byProduct)
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

  // Gaya visual buat 3 besar di ranking Produk Terlaris -- emas, perak,
  // perunggu. Produk peringkat 4 ke bawah pakai gaya netral (fallback
  // di bawah, di dalam render list).
  const TOP_RANK_STYLE = [
    {
      ring: "ring-cyan-400/70",
      bar: "from-cyan-400 via-sky-500 to-blue-600",
      glow: "shadow-[0_0_10px_rgba(56,189,248,0.5)]",
      badge: "\u{1F451}", // 👑
      num: "bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent",
    },
    {
      ring: "ring-fuchsia-400/60",
      bar: "from-fuchsia-400 to-purple-600",
      glow: "shadow-[0_0_8px_rgba(232,121,249,0.4)]",
      badge: null,
      num: "bg-gradient-to-r from-fuchsia-300 to-purple-400 bg-clip-text text-transparent",
    },
    {
      ring: "ring-emerald-400/60",
      bar: "from-emerald-400 to-teal-600",
      glow: "shadow-[0_0_8px_rgba(52,211,153,0.4)]",
      badge: null,
      num: "bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent",
    },
  ];

  return (
    <div className="animate-fadeIn">
      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2.5 tracking-tight">
        <span className="w-2 h-2 rounded-full bg-accent-400"></span>
        Overview
      </h2>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
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
              ? "Terjual 7 Hari Terakhir (Toko Kamu)"
              : `Terjual 7 Hari s.d. ${shortLabel(overviewDate)} (Toko Kamu)`
          }
          value={`${salesLast7} pcs`}
          accent="#5b7fff"
        />
        <StatCard
          icon={AlertTriangle}
          label="Toko Kamu Perlu Perhatian"
          value={`${storesNeedAttention} / ${storeHealth.length}`}
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

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-6">
        {/* Tren penjualan */}
        <div className="bg-panel border border-line rounded-xl p-5">
          <h3 className="text-sm font-medium text-neutral-400 mb-4">
            Tren Penjualan {rangeDaysCount} Hari Terakhir (toko kamu)
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

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
        {/* Produk terlaris -- ranking bergaya "leaderboard": foto produk,
            ring warna emas/perak/perunggu buat 3 besar, mini bar progress,
            dan badge tren naik dibanding 7 hari sebelumnya. */}
        <div className="bg-panel border border-line rounded-xl p-5">
          <h3 className="text-sm font-medium text-neutral-400 mb-4 flex items-center gap-1.5">
            <Flame size={14} className="text-red-400" />
            Produk Terlaris Toko Kamu ({rangeDaysCount} Hari Terakhir)
          </h3>
          {topProducts.length === 0 ? (
            <p className="text-neutral-500 text-sm text-center py-8">
              Belum ada penjualan di periode ini
            </p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const maxQty = Math.max(...topProducts.map((p) => p.qty), 1);
                return topProducts.map((p, i) => {
                  const style = TOP_RANK_STYLE[i] ?? {
                    ring: "ring-line",
                    bar: "from-accent-500 to-accent-400",
                    glow: "",
                    badge: null,
                    num: "text-neutral-600",
                  };
                  const isTrending =
                    p.previous > 0 && p.current > p.previous * 1.2;

                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span
                        className={`text-base font-extrabold w-5 text-right shrink-0 ${style.num}`}
                      >
                        {i + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="text-xs text-neutral-200 truncate flex items-center gap-1.5">
                            {p.name}
                            {isTrending && (
                              <span className="shrink-0 text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                                🔥 Naik
                              </span>
                            )}
                          </p>
                          <span className="text-xs tabular-nums text-neutral-300 shrink-0">
                            {p.qty} pcs
                          </span>
                        </div>
                        <div className="h-2.5 bg-black/30 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${style.bar} ${style.glow} rounded-full transition-all duration-700`}
                            style={{ width: `${(p.qty / maxQty) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div
                        className={`relative w-16 aspect-video rounded-lg bg-black/30 overflow-hidden shrink-0 ring-2 ${style.ring}`}
                      >
                        {p.photo_url && (
                          <img
                            src={p.photo_url}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                        {style.badge && (
                          <span className="absolute -top-1.5 -right-1.5 text-xs">
                            {style.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {/* Kesehatan toko (toko yang currentUser kelola sendiri) */}
        <div className="bg-panel border border-line rounded-xl p-5">
          <h3 className="text-sm font-medium text-neutral-400 mb-1 flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-red-400" />
            Kesehatan Toko Kamu
          </h3>
          <p className="text-[11px] text-neutral-600 mb-4">
            7 hari terakhir vs 7 hari sebelumnya. "Kosong"/"Turun" di atas.
          </p>
          {storeHealth.length === 0 ? (
            <p className="text-neutral-500 text-sm text-center py-8">
              Belum ada toko yang kamu kelola
            </p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {storeHealth.map((s) => {
                const statusStyles: Record<
                  string,
                  { dot: string; text: string }
                > = {
                  kosong: { dot: "bg-red-500", text: "text-red-400" },
                  turun: { dot: "bg-red-500", text: "text-red-400" },
                  stabil: { dot: "bg-amber-400", text: "text-amber-400" },
                  naik: { dot: "bg-emerald-400", text: "text-emerald-400" },
                };
                const style = statusStyles[s.status];
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2.5 bg-black/20 border border-line/60 rounded-lg px-3 py-2"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`}
                    ></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-neutral-200 truncate">
                        {s.name}{" "}
                        <span className="text-neutral-600">({s.code})</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs tabular-nums text-neutral-300">
                        {s.current} pcs
                      </p>
                      <p className={`text-[10px] font-medium ${style.text}`}>
                        {s.status === "kosong" && "Belum ada penjualan"}
                        {s.status === "naik" &&
                          s.changePct === null &&
                          "Baru mulai jual"}
                        {s.changePct !== null &&
                          `${s.changePct > 0 ? "+" : ""}${s.changePct.toFixed(0)}%`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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

const PRODUCT_TAB = { id: "produk", label: "Produk" } as const;
const MAPPINGS_TAB = { id: "mappings", label: "Mappings" } as const;

const ALL_TABS = [...MASTER_TABS, PRODUCT_TAB, MAPPINGS_TAB];

type MasterTabId =
  | (typeof MASTER_TABS)[number]["id"]
  | typeof PRODUCT_TAB.id
  | typeof MAPPINGS_TAB.id;

function MasterDataSection({ currentUser }: { currentUser: string }) {
  const [activeTab, setActiveTab] = useState<MasterTabId>("model");
  const [items, setItems] = useState<any[]>([]);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<"bordir" | "tempel">("bordir");
  const [message, setMessage] = useState<FlashMessage | null>(null);

  const currentTab = MASTER_TABS.find((t) => t.id === activeTab);

  async function loadItems() {
    if (!currentTab) return; // tab "produk" punya sumber data & form sendiri
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
    if (!currentTab) return;
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
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {ALL_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id
                ? "bg-accent-500 text-white"
                : "bg-panel border border-line text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "produk" ? (
        <ProductFormSection currentUser={currentUser} />
      ) : activeTab === "mappings" ? (
        <MappingsSection />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* Daftar item yang sudah ada */}
          <div>
            <h3 className="text-sm text-neutral-500 font-medium mb-3">
              {currentTab!.label} yang sudah ada ({items.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-panel border border-line rounded-lg px-3.5 py-3"
                >
                  <p className="text-sm text-neutral-200 truncate">
                    {item.name}
                  </p>
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
          <div className="bg-panel border border-line rounded-xl p-5 lg:sticky lg:top-20">
            <h3 className="text-sm font-medium text-neutral-300 mb-4">
              Tambah {currentTab!.label} Baru
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
              Tambah {currentTab!.label}
            </button>

            <p className="text-[11px] text-neutral-600 mt-3">
              Ditambahkan oleh {currentUser}. Ingat diskusiin dulu sama tim
              sebelum nambah ya.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

type MasterOption = { id: string; name: string; code: string; type?: string };

function ProductFormSection({ currentUser }: { currentUser: string }) {
  const [hatModels, setHatModels] = useState<MasterOption[]>([]);
  const [materials, setMaterials] = useState<MasterOption[]>([]);
  const [colors, setColors] = useState<MasterOption[]>([]);
  const [logos, setLogos] = useState<MasterOption[]>([]);
  const [existingProducts, setExistingProducts] = useState<
    {
      id: string;
      sku: string;
      full_name: string;
      photo_url: string | null;
    }[]
  >([]);

  const [hatModelId, setHatModelId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [colorId, setColorId] = useState("");
  const [logoId, setLogoId] = useState("");
  const [sku, setSku] = useState("");
  const [fullName, setFullName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FlashMessage | null>(null);

  function flash(text: string, type: FlashType = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  }

  async function loadMasterOptions() {
    const [hm, mt, cl, lg] = await Promise.all([
      supabase.from("hat_models").select("id, name, code").order("name"),
      supabase.from("materials").select("id, name, code").order("name"),
      supabase.from("colors").select("id, name, code").order("name"),
      supabase.from("logos").select("id, name, code, type").order("name"),
    ]);
    setHatModels(hm.data ?? []);
    setMaterials(mt.data ?? []);
    setColors(cl.data ?? []);
    setLogos(lg.data ?? []);
  }

  async function loadExistingProducts() {
    const { data } = await supabase
      .from("products")
      .select("id, sku, full_name, photo_url")
      .order("created_at", { ascending: false })
      .limit(60);
    setExistingProducts(data ?? []);
  }

  useEffect(() => {
    loadMasterOptions();
    loadExistingProducts();
  }, []);

  // Auto-suggest SKU & nama produk begitu 4 dropdown di atas udah kepilih
  // semua. Tetap bisa diedit manual di kolomnya sebelum disimpan.
  useEffect(() => {
    if (!hatModelId || !materialId || !colorId || !logoId) return;
    const hm = hatModels.find((x) => x.id === hatModelId);
    const mt = materials.find((x) => x.id === materialId);
    const cl = colors.find((x) => x.id === colorId);
    const lg = logos.find((x) => x.id === logoId);
    if (!hm || !mt || !cl || !lg) return;

    setSku(`${hm.code}-${mt.code}-${cl.code}-${lg.code}`.toUpperCase());
    setFullName(`Topi ${hm.name} ${mt.name} ${cl.name} ${lg.name}`);
  }, [
    hatModelId,
    materialId,
    colorId,
    logoId,
    hatModels,
    materials,
    colors,
    logos,
  ]);

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!hatModelId || !materialId || !colorId || !logoId) {
      flash("Pilih Model, Bahan, Warna, dan Logo dulu", "warning");
      return;
    }
    if (!sku.trim() || !fullName.trim()) {
      flash("SKU dan nama produk gak boleh kosong", "warning");
      return;
    }

    setSaving(true);

    // Upload foto dulu (kalau ada) sebelum insert baris produknya, biar
    // photo_url-nya udah siap dipasang bareng data lain dalam satu insert.
    let photoUrl: string | null = null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `${sku.trim().toLowerCase()}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-photos")
        .upload(path, photoFile);

      if (uploadError) {
        setSaving(false);
        flash("Gagal upload foto: " + uploadError.message, "error");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-photos")
        .getPublicUrl(path);
      photoUrl = publicUrlData.publicUrl;
    }

    const { error } = await supabase.from("products").insert({
      hat_model_id: hatModelId,
      material_id: materialId,
      color_id: colorId,
      logo_id: logoId,
      sku: sku.trim().toUpperCase(),
      full_name: fullName.trim(),
      photo_url: photoUrl,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      flash(
        error.message.toLowerCase().includes("duplicate")
          ? "SKU ini sudah ada, coba cek lagi kombinasinya"
          : "Gagal menambah produk, coba lagi",
        "error",
      );
      return;
    }

    flash("Produk baru ditambahkan!", "success");
    setHatModelId("");
    setMaterialId("");
    setColorId("");
    setLogoId("");
    setSku("");
    setFullName("");
    setPhotoFile(null);
    setPhotoPreview(null);
    loadExistingProducts();
  }

  return (
    <div>
      <StatusBanner message={message} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Daftar produk yang sudah ada */}
        <div>
          <h3 className="text-sm text-neutral-500 font-medium mb-3">
            Produk yang sudah ada ({existingProducts.length})
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[560px] overflow-y-auto pr-1">
            {existingProducts.map((p) => (
              <div
                key={p.id}
                className="bg-panel border border-line rounded-lg overflow-hidden"
              >
                <div className="aspect-video bg-black/30">
                  {p.photo_url && (
                    <img
                      src={p.photo_url}
                      alt={p.full_name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[11px] text-neutral-200 truncate">
                    {p.full_name}
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-0.5 truncate">
                    {p.sku}
                  </p>
                </div>
              </div>
            ))}
            {existingProducts.length === 0 && (
              <p className="text-neutral-500 text-sm col-span-3">
                Belum ada produk
              </p>
            )}
          </div>
        </div>

        {/* Form tambah produk baru */}
        <div className="bg-panel border border-line rounded-xl p-5 lg:sticky lg:top-20">
          <h3 className="text-sm font-medium text-neutral-300 mb-4">
            Tambah Produk Baru
          </h3>

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Model Topi
          </label>
          <select
            value={hatModelId}
            onChange={(e) => setHatModelId(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500"
          >
            <option value="">— pilih —</option>
            {hatModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Bahan
          </label>
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500"
          >
            <option value="">— pilih —</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Warna
          </label>
          <select
            value={colorId}
            onChange={(e) => setColorId(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500"
          >
            <option value="">— pilih —</option>
            {colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Logo
          </label>
          <select
            value={logoId}
            onChange={(e) => setLogoId(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500"
          >
            <option value="">— pilih —</option>
            {logos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code}) · {l.type}
              </option>
            ))}
          </select>

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            SKU
          </label>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            placeholder="Otomatis terisi dari pilihan di atas"
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 uppercase focus:outline-none focus:border-accent-500"
          />

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Nama Produk
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Otomatis terisi, bisa diedit"
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500"
          />

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Foto Produk
          </label>
          <label className="flex items-center justify-center gap-2 w-full border border-dashed border-line rounded-lg px-3 py-4 text-sm text-neutral-400 mb-3 cursor-pointer hover:border-accent-500 hover:text-neutral-200 transition-colors">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Preview"
                className="h-20 rounded-md object-cover"
              />
            ) : (
              <span className="flex items-center gap-2">
                <ImagePlus size={16} />
                Pilih foto
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </label>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="shine-btn w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-60 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors duration-300 active:scale-95 mt-1 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Menyimpan..." : "Tambah Produk"}
          </button>

          <p className="text-[11px] text-neutral-600 mt-3">
            Ditambahkan oleh {currentUser}. SKU & nama otomatis terisi dari
            pilihan di atas, tapi bisa diedit sebelum disimpan.
          </p>
        </div>
      </div>
    </div>
  );
}

type SimpleProduct = {
  id: string;
  sku: string;
  full_name: string;
  photo_url: string | null;
};

type SimpleStore = { id: string; name: string; code: string };

type MappingRow = {
  id: string;
  marketplace_product_name: string;
  marketplace_variasi: string;
};

function normalize(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function MappingsSection() {
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [stores, setStores] = useState<SimpleStore[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<SimpleProduct | null>(
    null,
  );
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [existingMappings, setExistingMappings] = useState<MappingRow[]>([]);
  const [namesText, setNamesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FlashMessage | null>(null);

  function flash(text: string, type: FlashType = "success") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  }

  async function loadProducts() {
    const { data } = await supabase
      .from("products")
      .select("id, sku, full_name, photo_url")
      .eq("is_active", true)
      .order("full_name");
    setProducts(data ?? []);
  }

  async function loadStores() {
    const { data } = await supabase
      .from("stores")
      .select("id, name, code")
      .order("code");
    setStores(data ?? []);
  }

  useEffect(() => {
    loadProducts();
    loadStores();
  }, []);

  async function loadExistingMappings(productId: string, storeId: string) {
    if (!productId || !storeId) {
      setExistingMappings([]);
      return;
    }
    // Filter "marketplace_sku=''" udah gak relevan -- SKU gak lagi
    // dipakai buat matching, jadi gak perlu dibedain lagi.
    const { data } = await supabase
      .from("sku_mappings")
      .select("id, marketplace_product_name, marketplace_variasi")
      .eq("product_id", productId)
      .eq("store_id", storeId);
    setExistingMappings(data ?? []);
  }

  useEffect(() => {
    if (selectedProduct && selectedStoreId) {
      loadExistingMappings(selectedProduct.id, selectedStoreId);
    } else {
      setExistingMappings([]);
    }
  }, [selectedProduct, selectedStoreId]);

  async function handleRemoveMapping(mappingId: string) {
    await supabase.from("sku_mappings").delete().eq("id", mappingId);
    if (selectedProduct) {
      loadExistingMappings(selectedProduct.id, selectedStoreId);
    }
  }

  async function handleMapNames() {
    if (!selectedProduct) {
      flash("Pilih dulu produk aslinya (klik salah satu foto)", "warning");
      return;
    }
    if (!selectedStoreId) {
      flash("Pilih toko dulu", "warning");
      return;
    }
    const lines = namesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      flash("Tempel minimal 1 nama produk dulu", "warning");
      return;
    }

    setSaving(true);
    let success = 0;
    let skipped = 0;
    for (const line of lines) {
      // "Nama Produk||Variasi" -- pemisahnya DUA pipe nempel, bukan satu,
      // soalnya nama produk asli (judul listing seller) kadang emang
      // ngandung 1 pipe berdiri sendiri (mis. "... | Bordir Timbul ...").
      // Dua pipe nempel praktis gak pernah muncul natural, jadi aman
      // dipakai sebagai pemisah sengaja.
      const sepIndex = line.indexOf("||");
      const rawName = sepIndex === -1 ? line : line.slice(0, sepIndex);
      const rawVariasi = sepIndex === -1 ? "" : line.slice(sepIndex + 2);
      const name = normalize(rawName);
      const variasi = normalize(rawVariasi);
      if (!name) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("sku_mappings").insert({
        store_id: selectedStoreId,
        marketplace_sku: "",
        marketplace_variasi: variasi,
        marketplace_product_name: name,
        product_id: selectedProduct.id,
      });
      if (error) {
        skipped++;
      } else {
        success++;
      }
    }
    setSaving(false);
    flash(
      `${success} nama berhasil dipetakan` +
        (skipped > 0 ? `, ${skipped} dilewati (mungkin udah ada)` : ""),
      success > 0 ? "success" : "warning",
    );
    setNamesText("");
    loadExistingMappings(selectedProduct.id, selectedStoreId);
  }

  return (
    <div>
      <StatusBanner message={message} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Grid foto produk -- klik buat pilih "ini barangnya" */}
        <div>
          <h3 className="text-sm text-neutral-500 font-medium mb-3">
            Pilih produk asli ({products.length})
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[560px] overflow-y-auto pr-1">
            {products.map((p) => {
              const isSelected = selectedProduct?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className={`text-left bg-panel border rounded-lg overflow-hidden transition-colors ${
                    isSelected
                      ? "border-accent-500 ring-2 ring-accent-500/50"
                      : "border-line hover:border-neutral-500"
                  }`}
                >
                  <div className="aspect-video bg-black/30">
                    {p.photo_url && (
                      <img
                        src={p.photo_url}
                        alt={p.full_name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] text-neutral-200 truncate">
                      {p.full_name}
                    </p>
                    <p className="text-[10px] text-neutral-500 mt-0.5 truncate">
                      {p.sku}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel pemetaan */}
        <div className="bg-panel border border-line rounded-xl p-5 lg:sticky lg:top-20">
          <h3 className="text-sm font-medium text-neutral-300 mb-1">
            Petakan Nama Marketplace
          </h3>
          <p className="text-xs text-neutral-500 mb-4">
            {selectedProduct
              ? `Produk terpilih: ${selectedProduct.full_name} (${selectedProduct.sku})`
              : "Klik salah satu foto di sebelah kiri dulu"}
          </p>

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Toko
          </label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-accent-500"
          >
            <option value="">— pilih toko —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          {existingMappings.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-neutral-400 font-medium mb-1.5">
                Nama yang sudah dipetakan ({existingMappings.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {existingMappings.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 bg-black/30 rounded px-2 py-1.5"
                  >
                    <span className="text-xs text-neutral-300 truncate">
                      {m.marketplace_product_name}
                      {m.marketplace_variasi && (
                        <span className="text-neutral-500">
                          {" "}
                          — {m.marketplace_variasi}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleRemoveMapping(m.id)}
                      className="text-neutral-500 hover:text-red-400 text-xs shrink-0"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="text-xs text-neutral-400 mb-1.5 font-medium block">
            Tempel nama produk dari Shopee (1 baris = 1 nama)
          </label>
          <textarea
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            placeholder={
              "Satu baris satu produk, kalau ada variasi pakai || untuk memisahkan nama produk dan variasi ya"
            }
            rows={6}
            className="w-full bg-black/40 border border-line rounded-lg px-3 py-2.5 text-xs mb-3 focus:outline-none focus:border-accent-500 font-mono"
          />

          <button
            onClick={handleMapNames}
            disabled={saving}
            className="shine-btn w-full bg-accent-500 hover:bg-accent-400 disabled:opacity-60 text-white py-2.5 rounded-lg font-semibold text-sm transition-colors duration-300 active:scale-95"
          >
            {saving ? "Menyimpan..." : "Petakan Semua Nama"}
          </button>

          <p className="text-[11px] text-neutral-600 mt-3">
            Dipakai buat toko yang SKU/Variasi-nya kosong di Shopee -- tiap nama
            beda-beda tetap boleh nunjuk ke produk yang sama.
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
      <div className="bg-panel/80 backdrop-blur-sm border-b border-line px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden -ml-1 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
            aria-label="Buka menu"
          >
            <Menu size={20} strokeWidth={1.75} />
          </button>
          <h1 className="text-base md:text-lg font-semibold tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-500 shrink-0"></span>
            Modius Admin
          </h1>
        </div>
        <div className="flex items-center gap-2.5 pl-1.5 pr-2 md:pr-3 py-1.5 rounded-lg border border-line">
          <img
            src={AVATARS[currentUser]}
            alt={currentUser}
            className="w-7 h-7 rounded-full object-cover"
          />
          <span className="text-left leading-tight hidden sm:block">
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
        {/* Overlay gelap saat drawer mobile terbuka */}
        {mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
          />
        )}

        {/* Sidebar Navigasi: drawer di mobile, statis di desktop */}
        <div
          className={`fixed md:static top-0 left-0 h-full md:h-auto w-64 md:w-60 bg-panel md:bg-panel/50 border-r border-line md:min-h-[calc(100vh-65px)] p-4 z-50 transform transition-transform duration-300 ease-out ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0`}
        >
          <div className="flex items-center justify-between mb-4 md:hidden">
            <span className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-500"></span>
              Modius Admin
            </span>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              aria-label="Tutup menu"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
          <nav className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSection(s.id);
                    setMobileNavOpen(false);
                  }}
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
        <div className="flex-1 p-4 md:p-8 min-w-0">
          {activeSection === "overview" && (
            <OverviewSection currentUser={currentUser} />
          )}
          {activeSection === "qc" && (
            <QcCheckpointSection
              currentUser={currentUser}
              onCountChange={setQcPendingCount}
            />
          )}
          {activeSection === "sales" && (
            <CatatanPenjualanSection currentUser={currentUser} />
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
