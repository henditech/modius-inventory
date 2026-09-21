"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Package,
  Boxes,
  AlertTriangle,
  TrendingUp,
  Store,
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
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

type Supply = { id: string; name: string; unit: string; current_qty: number };
type PinLogo = { id: string; name: string; available_qty: number };
type Product = {
  id: string;
  full_name: string;
  photo_url: string | null;
  stock_qty: number;
};
type SalesDay = { key: string; label: string; qty: number; returned: number };
type TopProduct = {
  id: string;
  name: string;
  photo_url: string | null;
  qty: number;
};
type Section = "overview" | "topi" | "pelengkap";

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "topi", label: "Stok Topi", icon: Package },
  { id: "pelengkap", label: "Stok Pelengkap", icon: Boxes },
];

function getStockStatus(qty: number) {
  if (qty <= 60)
    return { label: "Kritis", dot: "bg-[#FF5470]", text: "text-[#FF5470]" };
  if (qty <= 120)
    return { label: "Menipis", dot: "bg-[#FFB020]", text: "text-[#FFB020]" };
  return { label: "Aman", dot: "bg-[#39FF88]", text: "text-[#39FF88]" };
}

// Bahan pelengkap & pin biasanya dibeli dalam jumlah lebih kecil dari stok topi,
// jadi pakai ambang batas sendiri. Sesuaikan angka ini kalau ternyata belum pas.
function getSupplyStatus(qty: number) {
  if (qty <= 5)
    return { label: "Kritis", dot: "bg-[#FF5470]", text: "text-[#FF5470]" };
  if (qty <= 15)
    return { label: "Menipis", dot: "bg-[#FFB020]", text: "text-[#FFB020]" };
  return { label: "Aman", dot: "bg-[#39FF88]", text: "text-[#39FF88]" };
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function todayStr() {
  return isoDate(new Date());
}

function shortLabel(isoStr: string) {
  const d = new Date(isoStr + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function formatFullDate(isoStr: string) {
  return new Date(`${isoStr}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
    <div className="bg-[#151A18] border border-[#262E2A] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#8FA39A] font-medium">{label}</span>
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
    background: "#0B0D0C",
    border: "1px solid #262E2A",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#8FA39A" },
};

const TOP_RANK_STYLE = [
  {
    ring: "ring-[#39FF88]/70",
    bar: "from-[#39FF88] to-[#1fae5c]",
    glow: "shadow-[0_0_10px_rgba(57,255,136,0.5)]",
    badge: "\u{1F451}", // 👑
    num: "text-[#39FF88]",
  },
  {
    ring: "ring-[#C7D6CE]/50",
    bar: "from-[#C7D6CE] to-[#8FA39A]",
    glow: "",
    badge: null,
    num: "text-[#C7D6CE]",
  },
  {
    ring: "ring-[#D89A5C]/60",
    bar: "from-[#D89A5C] to-[#A9662E]",
    glow: "",
    badge: null,
    num: "text-[#D89A5C]",
  },
];

export default function IbuBosPage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [pins, setPins] = useState<PinLogo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesTrend, setSalesTrend] = useState<SalesDay[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [salesLast7, setSalesLast7] = useState(0);
  const [storeCount, setStoreCount] = useState(0);
  const [overviewDate, setOverviewDate] = useState(todayStr());
  const [supplyInputs, setSupplyInputs] = useState<Record<string, number>>({});
  const [supplyReduceInputs, setSupplyReduceInputs] = useState<
    Record<string, number>
  >({});
  const [supplyReduceReasons, setSupplyReduceReasons] = useState<
    Record<string, string>
  >({});
  const [pinBuyInputs, setPinBuyInputs] = useState<Record<string, number>>({});
  const [pinDefectInputs, setPinDefectInputs] = useState<
    Record<string, number>
  >({});
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  async function loadCore() {
    const { data: supplyData } = await supabase
      .from("packing_supplies")
      .select("id, name, unit, current_qty")
      .order("name");
    if (supplyData) setSupplies(supplyData);

    const { data: pinData } = await supabase
      .from("logos")
      .select("id, name, pin_stock(available_qty)")
      .eq("type", "tempel");
    if (pinData) {
      setPins(
        pinData.map((p: any) => {
          const stockRow = Array.isArray(p.pin_stock)
            ? p.pin_stock[0]
            : p.pin_stock;
          return {
            id: p.id,
            name: p.name,
            available_qty: stockRow?.available_qty ?? 0,
          };
        }),
      );
    }

    // Dibaca dari view `product_available_stock`, bukan tabel `stock` langsung.
    // Produk tipe "tempel" (topi polos + pin) tidak punya stok fisik sendiri —
    // view ini yang menghitung stok mereka dari min(stok topi polos, stok pin).
    const { data: productData } = await supabase
      .from("product_available_stock")
      .select("product_id, full_name, photo_url, available_qty")
      .eq("is_active", true)
      .order("available_qty", { ascending: true });
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
  }

  async function loadOverview(referenceDateStr: string) {
    const reference = new Date(`${referenceDateStr}T12:00:00`);

    // Bangun 14 hari berturut-turut berakhir di tanggal referensi
    const days: SalesDay[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(reference);
      d.setDate(d.getDate() - i);
      const key = isoDate(d);
      days.push({ key, label: shortLabel(key), qty: 0, returned: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));

    const start = new Date(reference);
    start.setDate(start.getDate() - 13);
    start.setHours(0, 0, 0, 0);

    const end = new Date(reference);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);

    const { data: salesData } = await supabase
      .from("sales")
      .select("quantity, sold_at, products(id, full_name, photo_url)")
      .gte("sold_at", start.toISOString())
      .lt("sold_at", end.toISOString());

    const { data: returnsData } = await supabase
      .from("sales")
      .select("quantity, status_changed_at")
      .eq("status", "batal")
      .gte("status_changed_at", start.toISOString())
      .lt("status_changed_at", end.toISOString());

    const sevenDaysAgo = new Date(reference);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const topMap = new Map<
      string,
      { name: string; photo_url: string | null; qty: number }
    >();
    let last7Total = 0;

    (salesData ?? []).forEach((s: any) => {
      const key = (s.sold_at as string).split("T")[0];
      const day = dayMap.get(key);
      if (day) day.qty += s.quantity;

      if (new Date(s.sold_at) >= sevenDaysAgo) last7Total += s.quantity;

      const productId = s.products?.id ?? "unknown";
      const name = s.products?.full_name ?? "Produk";
      const photoUrl = s.products?.photo_url ?? null;
      if (!topMap.has(productId)) {
        topMap.set(productId, { name, photo_url: photoUrl, qty: 0 });
      }
      topMap.get(productId)!.qty += s.quantity;
    });

    (returnsData ?? []).forEach((r: any) => {
      const key = (r.status_changed_at as string).split("T")[0];
      const day = dayMap.get(key);
      if (day) day.returned += r.quantity;
    });

    setSalesTrend(days);
    setSalesLast7(last7Total);
    setTopProducts(
      Array.from(topMap.entries())
        .map(([id, p]) => ({
          id,
          name: p.name,
          photo_url: p.photo_url,
          qty: p.qty,
        }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5),
    );

    const { count } = await supabase
      .from("stores")
      .select("*", { count: "exact", head: true });
    setStoreCount(count ?? 0);
  }

  useEffect(() => {
    loadCore();
  }, []);

  useEffect(() => {
    loadOverview(overviewDate);
  }, [overviewDate]);

  const statusChartData = useMemo(() => {
    const counts = { Aman: 0, Menipis: 0, Kritis: 0 };
    products.forEach((p) => {
      const label = getStockStatus(p.stock_qty).label as keyof typeof counts;
      counts[label] += 1;
    });
    return [
      { name: "Aman", value: counts.Aman, color: "#39FF88" },
      { name: "Menipis", value: counts.Menipis, color: "#FFB020" },
      { name: "Kritis", value: counts.Kritis, color: "#FF5470" },
    ];
  }, [products]);

  const restockCount =
    (statusChartData.find((s) => s.name === "Menipis")?.value ?? 0) +
    (statusChartData.find((s) => s.name === "Kritis")?.value ?? 0);

  const pelengkapList = useMemo(() => {
    const supplyItems = supplies.map((s) => ({
      id: `supply-${s.id}`,
      name: s.name,
      qty: s.current_qty,
      unit: s.unit,
      category: "Bahan" as const,
      status: getSupplyStatus(s.current_qty),
    }));
    const pinItems = pins.map((p) => ({
      id: `pin-${p.id}`,
      name: p.name,
      qty: p.available_qty,
      unit: "pcs",
      category: "Pin" as const,
      status: getSupplyStatus(p.available_qty),
    }));
    return [...supplyItems, ...pinItems].sort((a, b) => a.qty - b.qty);
  }, [supplies, pins]);

  const pelengkapRestockCount = pelengkapList.filter(
    (i) => i.status.label !== "Aman",
  ).length;

  const isOverviewToday = overviewDate === todayStr();

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 2000);
  }

  async function handleAddSupply(supply: Supply) {
    const qty = supplyInputs[supply.id] || 0;
    if (qty <= 0) return;

    await supabase.from("packing_supply_restocks").insert({
      supply_id: supply.id,
      quantity: qty,
      restocked_by: "Ibu Bos",
    });
    await supabase
      .from("packing_supplies")
      .update({
        current_qty: supply.current_qty + qty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supply.id);

    setSupplyInputs((prev) => ({ ...prev, [supply.id]: 0 }));
    flash(`${supply.name} ditambah ${qty}`);
    loadCore();
  }

  async function handleReduceSupply(supply: Supply) {
    const qty = supplyReduceInputs[supply.id] || 0;
    if (qty <= 0) return;
    const reason = supplyReduceReasons[supply.id]?.trim() || null;

    await supabase.from("packing_supply_adjustments").insert({
      supply_id: supply.id,
      quantity: qty,
      reason,
      adjusted_by: "Ibu Bos",
    });
    await supabase
      .from("packing_supplies")
      .update({
        current_qty: Math.max(0, supply.current_qty - qty),
        updated_at: new Date().toISOString(),
      })
      .eq("id", supply.id);

    setSupplyReduceInputs((prev) => ({ ...prev, [supply.id]: 0 }));
    setSupplyReduceReasons((prev) => ({ ...prev, [supply.id]: "" }));
    flash(`${supply.name} dikurangi ${qty}`);
    loadCore();
  }

  // Beli pin baru: seluruh jumlah beli langsung menambah stok baik.
  // Cacat dari batch pembelian yang sama dicatat terpisah lewat handleDefectPin
  // (tidak otomatis dipotong di sini) supaya riwayatnya jelas di pin_losses.
  async function handleBuyPin(pin: PinLogo) {
    const bought = pinBuyInputs[pin.id] || 0;
    if (bought <= 0) return;

    await supabase.from("pin_purchases").insert({
      logo_id: pin.id,
      quantity_purchased: bought,
      quantity_defect: 0,
      purchased_by: "Ibu Bos",
    });

    await supabase.from("pin_stock").upsert(
      {
        logo_id: pin.id,
        available_qty: pin.available_qty + bought,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "logo_id" },
    );

    setPinBuyInputs((prev) => ({ ...prev, [pin.id]: 0 }));
    flash(`Pin ${pin.name}: +${bought} (beli)`);
    loadCore();
  }

  // Cacat berdiri sendiri: mengurangi stok pin yang SUDAH ADA, tidak perlu
  // ada pembelian baru dulu. Tercatat di pin_losses untuk riwayat.
  async function handleDefectPin(pin: PinLogo) {
    const defect = pinDefectInputs[pin.id] || 0;
    if (defect <= 0) return;

    await supabase.from("pin_losses").insert({
      logo_id: pin.id,
      quantity: defect,
      reason: "Cacat",
      reported_by: "Ibu Bos",
    });

    await supabase
      .from("pin_stock")
      .update({
        available_qty: Math.max(0, pin.available_qty - defect),
        updated_at: new Date().toISOString(),
      })
      .eq("logo_id", pin.id);

    setPinDefectInputs((prev) => ({ ...prev, [pin.id]: 0 }));
    flash(`Pin ${pin.name}: -${defect} (cacat)`);
    loadCore();
  }

  return (
    <div className="min-h-screen bg-[#0B0D0C] text-[#EAF2EE] font-[Inter,sans-serif] flex flex-col md:flex-row">
      {/* Sidebar - desktop only */}
      <div className="hidden md:block w-56 shrink-0 border-r border-[#262E2A] min-h-screen p-4">
        <h1 className="text-lg font-[Sora,sans-serif] font-semibold tracking-tight mb-8 flex items-center gap-2 px-1">
          <span className="w-2 h-2 rounded-full bg-[#39FF88]" />
          Panel Ibu Bos
        </h1>
        <nav className="space-y-1">
          {NAV.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-3 py-2.5 rounded-r-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2.5 border-l-2 ${
                  active
                    ? "bg-[#39FF88]/10 text-white border-[#39FF88]"
                    : "text-[#8FA39A] border-transparent hover:bg-white/5 hover:text-[#EAF2EE]"
                }`}
              >
                <Icon
                  size={17}
                  strokeWidth={1.75}
                  className={active ? "text-[#39FF88]" : "text-[#8FA39A]"}
                />
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Header + tab nav - mobile only */}
      <div className="md:hidden sticky top-0 z-30 bg-[#0B0D0C]/95 backdrop-blur-sm border-b border-[#262E2A]">
        <h1 className="text-base font-[Sora,sans-serif] font-semibold tracking-tight flex items-center gap-2 px-4 pt-4 pb-3">
          <span className="w-2 h-2 rounded-full bg-[#39FF88]" />
          Panel Ibu Bos
        </h1>
        <nav className="flex px-2 pb-1 gap-1">
          {NAV.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-colors duration-200 ${
                  active
                    ? "bg-[#39FF88]/10 text-white"
                    : "text-[#8FA39A] hover:bg-white/5"
                }`}
              >
                <Icon
                  size={18}
                  strokeWidth={1.75}
                  className={active ? "text-[#39FF88]" : "text-[#8FA39A]"}
                />
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Konten */}
      <div className="flex-1 px-4 py-6 md:px-10 md:py-8 max-w-[1400px] w-full min-w-0">
        <div className="hidden md:flex items-baseline justify-between mb-8">
          <h2 className="text-2xl font-[Sora,sans-serif] font-semibold tracking-tight">
            {NAV.find((s) => s.id === activeSection)?.label}
          </h2>
          {message && (
            <div className="text-sm font-medium text-[#39FF88] bg-[#39FF88]/10 border border-[#39FF88]/30 rounded-full px-4 py-1.5">
              {message}
            </div>
          )}
        </div>
        {message && (
          <div className="md:hidden text-sm font-medium text-center text-[#39FF88] bg-[#39FF88]/10 border border-[#39FF88]/30 rounded-full px-4 py-1.5 mb-4">
            {message}
          </div>
        )}

        {/* ===== OVERVIEW ===== */}
        {activeSection === "overview" && (
          <div>
            <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
              <p className="text-sm text-[#8FA39A]">
                {isOverviewToday
                  ? "Menampilkan data hingga hari ini"
                  : `Menampilkan data hingga ${formatFullDate(overviewDate)}`}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={overviewDate}
                  max={todayStr()}
                  onChange={(e) => setOverviewDate(e.target.value)}
                  className="bg-[#0B0D0C] border border-[#39FF88]/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#39FF88] focus:ring-1 focus:ring-[#39FF88]/50 transition-all [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
                {!isOverviewToday && (
                  <button
                    onClick={() => setOverviewDate(todayStr())}
                    className="text-xs text-[#39FF88] hover:underline px-2 py-2"
                  >
                    Hari ini
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
              <StatCard
                icon={Package}
                label="Total Produk"
                value={products.length}
                accent="#39FF88"
              />
              <StatCard
                icon={AlertTriangle}
                label="Butuh Restock"
                value={restockCount}
                accent="#FF5470"
              />
              <StatCard
                icon={Boxes}
                label="Perlu Restock Pelengkap"
                value={pelengkapRestockCount}
                accent="#FFB020"
              />
              <StatCard
                icon={TrendingUp}
                label={
                  isOverviewToday
                    ? "Terjual 7 Hari Terakhir"
                    : `Terjual 7 Hari s.d. ${shortLabel(overviewDate)}`
                }
                value={`${salesLast7} pcs`}
                accent="#39FF88"
              />
              <StatCard
                icon={Store}
                label="Toko Terdaftar"
                value={storeCount}
                accent="#8FA39A"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-6">
              <div className="bg-[#151A18] border border-[#262E2A] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#8FA39A] mb-4">
                  {isOverviewToday
                    ? "Tren Penjualan 14 Hari Terakhir"
                    : `Tren Penjualan 14 Hari s.d. ${shortLabel(overviewDate)}`}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salesTrend}>
                      <CartesianGrid stroke="#262E2A" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#8FA39A"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        interval={1}
                      />
                      <YAxis
                        stroke="#8FA39A"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        width={28}
                      />
                      <Tooltip
                        {...CHART_TOOLTIP_STYLE}
                        formatter={(value: any, name: any) => [
                          `${value} pcs`,
                          name === "qty" ? "Terjual" : "Retur",
                        ]}
                      />
                      <Legend
                        formatter={(value) =>
                          value === "qty" ? "Terjual" : "Retur"
                        }
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="qty"
                        stroke="#39FF88"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="returned"
                        stroke="#FF5470"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#151A18] border border-[#262E2A] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[#8FA39A] mb-4">
                  Status Stok Topi
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
                    <p className="text-2xl font-semibold">{products.length}</p>
                    <p className="text-xs text-[#8FA39A]">Produk</p>
                  </div>
                </div>
                <div className="flex justify-center gap-4 mt-3 flex-wrap">
                  {statusChartData.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center gap-1.5 text-xs"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-[#8FA39A]">{s.name}</span>
                      <span className="font-medium">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#151A18] border border-[#262E2A] rounded-xl p-5">
              <h3 className="text-sm font-medium text-[#8FA39A] mb-4 flex items-center gap-1.5">
                <Flame size={14} className="text-[#FF5470]" />
                Produk Terlaris (14 Hari{" "}
                {isOverviewToday
                  ? "Terakhir"
                  : `s.d. ${shortLabel(overviewDate)}`}
                )
              </h3>
              {topProducts.length === 0 ? (
                <p className="text-sm text-[#8FA39A] text-center py-8">
                  Belum ada penjualan di periode ini
                </p>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const maxQty = Math.max(
                      ...topProducts.map((p) => p.qty),
                      1,
                    );
                    return topProducts.map((p, i) => {
                      const style = TOP_RANK_STYLE[i] ?? {
                        ring: "ring-[#262E2A]",
                        bar: "from-[#39FF88]/60 to-[#39FF88]/40",
                        glow: "",
                        badge: null,
                        num: "text-[#8FA39A]",
                      };
                      return (
                        <div key={p.id} className="flex items-center gap-3">
                          <span
                            className={`text-base font-extrabold w-5 text-right shrink-0 ${style.num}`}
                          >
                            {i + 1}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <p className="text-xs text-[#EAF2EE] truncate">
                                {p.name}
                              </p>
                              <span className="text-xs tabular-nums text-[#C7D6CE] shrink-0">
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

            <div className="bg-[#151A18] border border-[#262E2A] rounded-xl p-5 mt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-[#8FA39A] flex items-center gap-1.5">
                  <Boxes size={14} className="text-[#39FF88]" />
                  Status Stok Pelengkap
                </h3>
                <div className="flex items-center gap-3 text-xs text-[#8FA39A]">
                  {["Kritis", "Menipis", "Aman"].map((label) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          getSupplyStatus(
                            label === "Kritis"
                              ? 0
                              : label === "Menipis"
                                ? 10
                                : 999,
                          ).dot
                        }`}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              {pelengkapList.length === 0 ? (
                <p className="text-sm text-[#8FA39A] text-center py-8">
                  Belum ada data bahan pelengkap atau pin
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
                  {pelengkapList.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 bg-[#0B0D0C] border border-[#262E2A] rounded-lg px-3 py-2"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${item.status.dot} shrink-0`}
                      />
                      <span className="text-xs text-[#EAF2EE] truncate flex-1">
                        {item.name}
                        <span className="text-[#8FA39A]">
                          {" "}
                          · {item.category}
                        </span>
                      </span>
                      <span className="text-xs text-[#8FA39A] tabular-nums shrink-0">
                        {item.qty} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== STOK TOPI ===== */}
        {activeSection === "topi" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {products.map((p) => {
              const status = getStockStatus(p.stock_qty);
              return (
                <div
                  key={p.id}
                  className="group bg-[#151A18] border border-[#262E2A] rounded-xl overflow-hidden hover:border-[#39FF88]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#39FF88]/10"
                >
                  {p.photo_url && (
                    <img
                      src={p.photo_url}
                      alt={p.full_name}
                      className="w-full aspect-video object-cover transition-transform duration-300 ease-in-out group-hover:scale-110"
                    />
                  )}
                  <div className="p-3">
                    <p className="text-xs font-medium truncate">
                      {p.full_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${status.dot}`}
                      ></span>
                      <span className={`text-xs ${status.text}`}>
                        {p.stock_qty} pcs — {status.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== STOK PELENGKAP ===== */}
        {activeSection === "pelengkap" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <div>
              <h3 className="text-sm uppercase tracking-wide text-[#8FA39A] font-medium mb-4">
                Bahan Pelengkap
              </h3>
              <div className="space-y-2">
                {supplies.map((s) => (
                  <div
                    key={s.id}
                    className="group bg-[#151A18] border border-[#262E2A] rounded-xl px-4 py-3.5 transition-all duration-300 hover:-translate-y-1 hover:border-[#39FF88]/40 hover:shadow-[0_8px_24px_-8px_rgba(57,255,136,0.25)]"
                  >
                    <p className="text-xs text-[#8FA39A] truncate mb-1">
                      {s.name}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-[#EAF2EE] leading-tight mb-3 transition-all duration-300 group-hover:text-[#39FF88] group-hover:drop-shadow-[0_0_12px_rgba(57,255,136,0.6)]">
                      {s.current_qty}
                      <span className="text-sm font-normal text-[#8FA39A] ml-1.5">
                        {s.unit}
                      </span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/5">
                      <input
                        type="number"
                        className="w-14 bg-[#0B0D0C] border border-[#262E2A] rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none focus:border-[#39FF88] focus:ring-1 focus:ring-[#39FF88]"
                        value={supplyInputs[s.id] || ""}
                        onChange={(e) =>
                          setSupplyInputs((prev) => ({
                            ...prev,
                            [s.id]: Number(e.target.value),
                          }))
                        }
                        placeholder="0"
                      />
                      <button
                        onClick={() => handleAddSupply(s)}
                        className="text-[#39FF88] border border-[#39FF88]/40 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-[#39FF88]/10 transition-colors"
                      >
                        + Tambah
                      </button>

                      <span className="w-px h-5 bg-white/10 mx-0.5" />

                      <input
                        type="text"
                        className="w-24 bg-[#0B0D0C] border border-[#262E2A] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#FF5470] focus:ring-1 focus:ring-[#FF5470]"
                        placeholder="Alasan (opsional)"
                        value={supplyReduceReasons[s.id] || ""}
                        onChange={(e) =>
                          setSupplyReduceReasons((prev) => ({
                            ...prev,
                            [s.id]: e.target.value,
                          }))
                        }
                      />
                      <input
                        type="number"
                        className="w-14 bg-[#0B0D0C] border border-[#262E2A] rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none focus:border-[#FF5470] focus:ring-1 focus:ring-[#FF5470]"
                        value={supplyReduceInputs[s.id] || ""}
                        onChange={(e) =>
                          setSupplyReduceInputs((prev) => ({
                            ...prev,
                            [s.id]: Number(e.target.value),
                          }))
                        }
                        placeholder="0"
                      />
                      <button
                        onClick={() => handleReduceSupply(s)}
                        className="text-[#FF5470] border border-[#FF5470]/40 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-[#FF5470]/10 transition-colors"
                      >
                        − Kurangi
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm uppercase tracking-wide text-[#8FA39A] font-medium mb-4">
                Pin Logam Logo
              </h3>
              <div className="space-y-2">
                {pins.map((p) => (
                  <div
                    key={p.id}
                    className="group bg-[#151A18] border border-[#262E2A] rounded-xl px-4 py-3.5 transition-all duration-300 hover:-translate-y-1 hover:border-[#39FF88]/40 hover:shadow-[0_8px_24px_-8px_rgba(57,255,136,0.25)]"
                  >
                    <p className="text-xs text-[#8FA39A] truncate mb-1">
                      {p.name}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-[#EAF2EE] leading-tight mb-3 transition-all duration-300 group-hover:text-[#39FF88] group-hover:drop-shadow-[0_0_12px_rgba(57,255,136,0.6)]">
                      {p.available_qty}
                      <span className="text-sm font-normal text-[#8FA39A] ml-1.5">
                        pcs baik
                      </span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/5">
                      <input
                        type="number"
                        className="w-14 bg-[#0B0D0C] border border-[#262E2A] rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none focus:border-[#39FF88] focus:ring-1 focus:ring-[#39FF88]"
                        placeholder="0"
                        value={pinBuyInputs[p.id] || ""}
                        onChange={(e) =>
                          setPinBuyInputs((prev) => ({
                            ...prev,
                            [p.id]: Number(e.target.value),
                          }))
                        }
                      />
                      <button
                        onClick={() => handleBuyPin(p)}
                        className="text-[#39FF88] border border-[#39FF88]/40 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-[#39FF88]/10 transition-colors"
                      >
                        + Beli
                      </button>

                      <span className="w-px h-5 bg-white/10 mx-0.5" />

                      <input
                        type="number"
                        className="w-14 bg-[#0B0D0C] border border-[#262E2A] rounded-lg px-2 py-1.5 text-center text-sm focus:outline-none focus:border-[#FF5470] focus:ring-1 focus:ring-[#FF5470]"
                        placeholder="0"
                        value={pinDefectInputs[p.id] || ""}
                        onChange={(e) =>
                          setPinDefectInputs((prev) => ({
                            ...prev,
                            [p.id]: Number(e.target.value),
                          }))
                        }
                      />
                      <button
                        onClick={() => handleDefectPin(p)}
                        className="text-[#FF5470] border border-[#FF5470]/40 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-[#FF5470]/10 transition-colors"
                      >
                        − Cacat
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
