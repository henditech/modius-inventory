"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type ScanStatus = "success" | "duplicate" | "notfound";

type ScanResult = {
  status: ScanStatus;
  code: string;
  items?: { product: string; qty: number }[];
  store?: string;
  scannedAt?: string | null;
};

const COOLDOWN_MS = 3000;

// -- Bunyi pakai Web Audio API langsung, gak perlu file suara eksternal --
function playTone(freqs: number[], durationMs = 150) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    let time = ctx.currentTime;
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.25, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + durationMs / 1000);
      time += durationMs / 1000 + 0.06;
    });
  } catch {
    // Browser gak support Web Audio -- scan tetap jalan, cuma tanpa bunyi.
  }
}

// Sukses: satu bip pendek nada tinggi.
function beepSuccess() {
  playTone([1250], 130);
}
// Duplikat (udah pernah discan): dua bip pendek nada sedang.
function beepDuplicate() {
  playTone([750, 750], 100);
}
// Gak ketemu: satu bip panjang nada rendah.
function beepNotFound() {
  playTone([260], 550);
}

export default function ScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const lastScan = useRef<{ code: string; time: number } | null>(null);
  const processingRef = useRef(false);
  const scannerInstanceRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } =
        await import("html5-qrcode");
      if (cancelled) return;

      const html5Qrcode = new Html5Qrcode("scan-reader", {
        // formatsToSupport itu punya constructor, bukan punya start() --
        // label resi itu barcode Code128, bukan QR, jadi ini wajib ada.
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });
      scannerInstanceRef.current = html5Qrcode;

      try {
        await html5Qrcode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 300, height: 150 },
          },
          handleDecoded,
          () => {
            // Gagal decode per-frame itu normal & sering -- diabaikan.
          },
        );
      } catch (err) {
        setCameraError(
          "Gak bisa akses kamera. Pastikan izin kamera diaktifkan buat halaman ini.",
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      const instance = scannerInstanceRef.current;
      if (instance) {
        instance.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecoded(decodedText: string) {
    const code = decodedText.trim();
    if (!code) return;

    const now = Date.now();
    // Kode yang sama masih di depan kamera -- jangan diproses ulang
    // sampai cooldown lewat.
    if (
      lastScan.current &&
      lastScan.current.code === code &&
      now - lastScan.current.time < COOLDOWN_MS
    ) {
      return;
    }
    if (processingRef.current) return;

    lastScan.current = { code, time: now };
    processingRef.current = true;

    const { data: rows } = await supabase
      .from("sales")
      .select(
        "id, quantity, status, status_changed_at, products(full_name), stores(code)",
      )
      .eq("awb_number", code);

    if (!rows || rows.length === 0) {
      beepNotFound();
      setResult({ status: "notfound", code });
      processingRef.current = false;
      return;
    }

    const items = rows.map((r: any) => ({
      product: r.products?.full_name ?? "-",
      qty: r.quantity,
    }));
    // Sama kayak kasus `stock` di /produksi dulu -- Supabase kadang
    // nganggep relasi 1-to-1 sebagai array, jadi dijaga dua-duanya.
    const storeRow = Array.isArray(rows[0]?.stores)
      ? rows[0]?.stores[0]
      : rows[0]?.stores;
    const store = storeRow?.code;
    const belumBatal = rows.filter((r: any) => r.status !== "batal");

    if (belumBatal.length === 0) {
      // Semua baris resi ini udah batal dari scan sebelumnya -- duplikat.
      beepDuplicate();
      setResult({
        status: "duplicate",
        code,
        items,
        store,
        scannedAt: rows[0]?.status_changed_at,
      });
      processingRef.current = false;
      return;
    }

    const ids = belumBatal.map((r: any) => r.id);
    await supabase
      .from("sales")
      .update({
        status: "batal",
        status_changed_at: new Date().toISOString(),
      })
      .in("id", ids);

    beepSuccess();
    setSuccessCount((c) => c + 1);
    setResult({ status: "success", code, items, store });
    processingRef.current = false;
  }

  const bgClass =
    result?.status === "success"
      ? "bg-emerald-950"
      : result?.status === "duplicate"
        ? "bg-amber-950"
        : result?.status === "notfound"
          ? "bg-red-950"
          : "bg-neutral-950";

  return (
    <div
      className={`min-h-screen ${bgClass} transition-colors duration-300 flex flex-col`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-medium text-neutral-200">
          Scanner Retur
        </span>
        <span className="text-xs text-neutral-400">
          {successCount} berhasil hari ini
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        <div
          id="scan-reader"
          className="w-full max-w-md rounded-xl overflow-hidden border border-white/10"
        />

        {cameraError && (
          <p className="text-red-400 text-sm text-center max-w-sm">
            {cameraError}
          </p>
        )}

        {result && (
          <div className="w-full max-w-md rounded-xl bg-black/40 border border-white/10 p-4 text-center">
            {result.status === "success" && (
              <p className="text-emerald-400 font-semibold mb-1">
                Retur tercatat
              </p>
            )}
            {result.status === "duplicate" && (
              <p className="text-amber-400 font-semibold mb-1">
                Sudah pernah discan
              </p>
            )}
            {result.status === "notfound" && (
              <p className="text-red-400 font-semibold mb-1">
                Resi tidak ditemukan
              </p>
            )}

            <p className="font-mono text-neutral-100 text-lg mb-2 break-all">
              {result.code}
            </p>

            {result.items && (
              <div className="text-sm text-neutral-300 space-y-0.5">
                {result.items.map((it, i) => (
                  <p key={i}>
                    {it.product} · {it.qty} pcs
                  </p>
                ))}
                {result.store && (
                  <p className="text-neutral-500 text-xs mt-1">
                    Toko: {result.store}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!result && !cameraError && (
          <p className="text-neutral-500 text-sm text-center">
            Arahkan kamera ke barcode resi
          </p>
        )}
      </div>
    </div>
  );
}
