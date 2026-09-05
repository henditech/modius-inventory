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
  if (qty <= 60)
    return { label: "Stok Kritis!", color: "bg-red-500", text: "text-red-600" };
  if (qty <= 120)
    return {
      label: "Stok Menipis",
      color: "bg-yellow-500",
      text: "text-yellow-600",
    };
  return { label: "Stok Aman", color: "bg-green-500", text: "text-green-600" };
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

        // ✅ URUTKAN DARI STOK PALING SEDIKIT → PALING BANYAK
        mapped.sort((a, b) => a.stock_qty - b.stock_qty);

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
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">
        Catat Produksi Topi
      </h1>

      {message && (
        <div className="mb-4 text-center text-lg font-semibold text-green-600">
          {message}
        </div>
      )}

      <div className="space-y-6">
        {products.map((product) => {
          const status = getStockStatus(product.stock_qty);
          return (
            <div key={product.id} className="border rounded-2xl p-4 shadow-sm">
              <div className="relative">
                {product.photo_url && (
                  <img
                    src={product.photo_url}
                    alt={product.full_name}
                    className="w-full h-48 object-cover rounded-xl mb-3"
                  />
                )}
                <div
                  className={`absolute top-2 right-2 ${status.color} text-white text-sm font-bold px-3 py-1 rounded-full`}
                >
                  {status.label}
                </div>
              </div>

              <p className="text-center font-medium mb-1">
                {product.full_name}
              </p>
              <p className={`text-center text-sm mb-3 ${status.text}`}>
                Sisa stok: {product.stock_qty} pcs
              </p>

              <div className="flex items-center justify-center gap-4 mb-3">
                <button
                  onClick={() => updateQty(product.id, -10)}
                  className="w-14 h-14 text-2xl rounded-full bg-gray-200 active:bg-gray-300"
                >
                  −
                </button>
                <span className="text-3xl font-bold w-16 text-center">
                  {quantities[product.id] || 0}
                </span>
                <button
                  onClick={() => updateQty(product.id, 10)}
                  className="w-14 h-14 text-2xl rounded-full bg-gray-200 active:bg-gray-300"
                >
                  +
                </button>
              </div>

              <button
                onClick={() => handleSave(product.id)}
                disabled={
                  savingId === product.id || (quantities[product.id] || 0) <= 0
                }
                className="w-full py-4 text-xl font-bold rounded-xl bg-green-600 text-white active:bg-green-700 disabled:bg-gray-300"
              >
                {savingId === product.id ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
