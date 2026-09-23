"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  full_name: string;
  photo_url: string | null;
  stock_qty: number;
};

function getStockStatus(qty: number) {
  if (qty <= 50)
    return { label: "Stok Kritis!", color: "bg-red-500", text: "text-red-400" };
  if (qty <= 100)
    return {
      label: "Stok Menipis",
      color: "bg-amber-500",
      text: "text-amber-400",
    };
  return {
    label: "Stok Aman",
    color: "bg-emerald-500",
    text: "text-emerald-400",
  };
}

export default function ProduksiPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProducts() {
      // Hanya tampilkan produk yang stoknya fisik nyata (polos & bordir).
      // Produk tipe "tempel" (topi polos + pin dirakit saat packing) sengaja
      // disembunyikan di sini karena tidak diproduksi langsung — stoknya
      // otomatis mengikuti stok topi polos + pin, bukan diinput manual.
      const { data } = await supabase
        .from("products")
        .select(
          "id, full_name, photo_url, stock(available_qty), logos!inner(type)",
        )
        .eq("is_active", true)
        .in("logos.type", ["polos", "bordir"]);

      if (data) {
        const mapped = data.map((p: any) => {
          const stockData = Array.isArray(p.stock) ? p.stock[0] : p.stock;
          return {
            id: p.id,
            full_name: p.full_name,
            photo_url: p.photo_url,
            stock_qty: stockData?.available_qty ?? 0,
          };
        });

        mapped.sort((a, b) => b.stock_qty - a.stock_qty);

        setProducts(mapped);
      }
    }
    loadProducts();
  }, []);

  function updateQty(id: string, delta: number) {
    setQuantities((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  }

  async function handleSave(productId: string) {
    const qty = quantities[productId] || 0;
    if (qty <= 0) return;

    setSavingId(productId);
    const { error } = await supabase.from("production_batches").insert({
      product_id: productId,
      quantity: qty,
      created_by: "Pak Wawan",
    });
    setSavingId(null);

    if (error) {
      setMessage("Gagal simpan, coba lagi");
    } else {
      setMessage("Berhasil disimpan!");
      setQuantities((prev) => ({ ...prev, [productId]: 0 }));
    }
    setTimeout(() => setMessage(""), 2000);
  }

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-neutral-100 p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center text-neutral-50">
          Catat Produksi Topi
        </h1>

        {message && (
          <div className="mb-4 text-center text-sm font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-2.5">
            {message}
          </div>
        )}

        <div className="space-y-5">
          {products.map((product) => {
            const status = getStockStatus(product.stock_qty);
            return (
              <div
                key={product.id}
                className="bg-[#111318] border border-[#23262e] rounded-2xl p-4"
              >
                <div className="rounded-xl overflow-hidden mb-3">
                  {product.photo_url ? (
                    <img
                      src={product.photo_url}
                      alt={product.full_name}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-black/30" />
                  )}
                </div>

                <p className="text-center font-medium mb-1 text-neutral-100">
                  {product.full_name}
                </p>
                <p className={`text-center text-sm mb-3 ${status.text}`}>
                  Sisa stok: {product.stock_qty} pcs
                </p>

                <div className="flex items-center justify-center gap-4 mb-3">
                  <button
                    onClick={() => updateQty(product.id, -10)}
                    className="w-14 h-14 flex items-center justify-center text-2xl font-semibold rounded-full bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors"
                  >
                    −
                  </button>
                  <span className="text-3xl font-bold w-16 text-center text-neutral-50 tabular-nums">
                    {quantities[product.id] || 0}
                  </span>
                  <button
                    onClick={() => updateQty(product.id, 10)}
                    className="w-14 h-14 flex items-center justify-center text-2xl font-semibold rounded-full bg-white/10 border border-white/15 text-white active:bg-white/20 transition-colors"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => handleSave(product.id)}
                  disabled={
                    savingId === product.id ||
                    (quantities[product.id] || 0) <= 0
                  }
                  className="w-full py-4 text-lg font-bold rounded-xl bg-emerald-500 text-black active:bg-emerald-400 disabled:bg-white/10 disabled:text-neutral-600 transition-colors"
                >
                  {savingId === product.id ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
