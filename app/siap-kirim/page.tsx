"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type ScanStatus = "success" | "duplicate" | "notfound" | "returned";

type ScanResult = {
  status: ScanStatus;
  code: string;
  items?: { product: string; qty: number }[];
  store?: string;
  packedAt?: string | null;
};

type PendingGroup = {
  key: string;
  orderNumber: string | null;
  store: string;
  soldAt: string;
  ids: (string | number)[];
  items: { product: string; qty: number }[];
};

const COOLDOWN_MS = 3000;

// -- Bunyi lewat Web Audio API, sama seperti scanner return --
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
    // Tanpa bunyi pun scan tetap jalan.
  }
}
const beepSuccess = () => playTone([1250], 130);
const beepDuplicate = () => playTone([750, 750], 100);
const beepProblem = () => playTone([260], 550);

function normalizeStore(storeField: any): { code?: string } | undefined {
  return Array.isArray(storeField) ? storeField[0] : storeField;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Makin lama dicetak tanpa dikonfirmasi, makin mencolok warnanya.
function ageInfo(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  const label =
    hours < 1
      ? `${Math.max(1, Math.round(hours * 60))} menit lalu`
      : hours < 24
        ? `${Math.floor(hours)} jam lalu`
        : `${Math.floor(hours / 24)} hari lalu`;
  const color =
    hours >= 24
      ? "text-red-400"
      : hours >= 6
        ? "text-amber-400"
        : "text-neutral-500";
  return { label, color };
}

export default function SiapKirimPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [pending, setPending] = useState<PendingGroup[]>([]);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const lastScan = useRef<{ code: string; time: number } | null>(null);
  const processingRef = useRef(false);
  const scannerInstanceRef = useRef<any>(null);

  // Resi yang sudah dicetak (ada di tabel sales) tapi belum dikonfirmasi siap kirim.
  async function loadPending() {
    const { data } = await supabase
      .from("sales")
      .select(
        "id, awb_number, resi_number, sold_at, quantity, products(full_name), stores(code)",
      )
      .is("packed_at", null)
      .or("status.is.null,status.neq.batal")
      .order("sold_at", { ascending: true });

    const map = new Map<string, PendingGroup>();
    for (const r of (data ?? []) as any[]) {
      const key = r.awb_number ?? r.resi_number ?? String(r.id);
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          orderNumber: r.resi_number ?? null,
          store: normalizeStore(r.stores)?.code ?? "-",
          soldAt: r.sold_at,
          ids: [],
          items: [],
        };
        map.set(key, g);
      }
      g.ids.push(r.id);
      g.items.push({ product: r.products?.full_name ?? "-", qty: r.quantity });
    }
    setPending([...map.values()]);
    setPendingLoaded(true);
  }

  useEffect(() => {
    loadPending();
    let cancelled = false;

    async function start() {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } =
        await import("html5-qrcode");
      if (cancelled) return;

      const html5Qrcode = new Html5Qrcode("scan-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      scannerInstanceRef.current = html5Qrcode;

      try {
        await html5Qrcode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (w: number, h: number) => ({
              width: Math.floor(w * 0.9),
              height: Math.floor(h * 0.4),
            }),
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: "continuous" }],
            } as any,
          },
          handleDecoded,
          () => {},
        );

        try {
          const zoom = html5Qrcode
            .getRunningTrackCameraCapabilities()
            .zoomFeature();
          if (zoom.isSupported()) zoom.apply(Math.min(2, zoom.max()));
        } catch {}
      } catch {
        setCameraError(
          "Tidak bisa mengakses kamera. Pastikan izin kamera diaktifkan untuk halaman ini.",
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      scannerInstanceRef.current?.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecoded(decodedText: string) {
    const code = decodedText.trim();
    if (!code) return;

    const now = Date.now();
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

    try {
      // Karakter ini merusak sintaks filter .or(); barcode resi normalnya tidak memuatnya.
      const safe = code.replace(/[,()]/g, "");
      const { data: rows } = await supabase
        .from("sales")
        .select(
          "id, quantity, status, packed_at, products(full_name), stores(code)",
        )
        .or(`awb_number.eq.${safe},resi_number.eq.${safe}`);

      if (!rows || rows.length === 0) {
        beepProblem();
        setResult({ status: "notfound", code });
        return;
      }

      const items = rows.map((r: any) => ({
        product: r.products?.full_name ?? "-",
        qty: r.quantity,
      }));
      const store = normalizeStore(rows[0]?.stores)?.code;

      // Resi ini sudah tercatat retur -- jangan dikonfirmasi diam-diam.
      const active = rows.filter((r: any) => r.status !== "batal");
      if (active.length === 0) {
        beepProblem();
        setResult({ status: "returned", code, items, store });
        return;
      }

      const belum = active.filter((r: any) => !r.packed_at);
      if (belum.length === 0) {
        beepDuplicate();
        setResult({
          status: "duplicate",
          code,
          items,
          store,
          packedAt: active[0]?.packed_at,
        });
        return;
      }

      await supabase
        .from("sales")
        .update({ packed_at: new Date().toISOString() })
        .in(
          "id",
          belum.map((r: any) => r.id),
        )
        .is("packed_at", null);

      beepSuccess();
      setSuccessCount((c) => c + 1);
      setResult({ status: "success", code, items, store });
      loadPending();
    } finally {
      processingRef.current = false;
    }
  }

  // Untuk pesanan yang dibatalkan pembeli sebelum dikirim, supaya tidak
  // menggantung selamanya di daftar.
  async function ignoreGroup(g: PendingGroup) {
    const label = g.key;
    if (
      !window.confirm(
        `Tandai resi ${label} sebagai dibatalkan / tidak dikirim?`,
      )
    )
      return;
    await supabase
      .from("sales")
      .update({ packed_at: new Date().toISOString(), packed_by: "dibatalkan" })
      .in("id", g.ids);
    loadPending();
  }

  const bgClass =
    result?.status === "success"
      ? "bg-emerald-950"
      : result?.status === "duplicate"
        ? "bg-amber-950"
        : result?.status === "notfound" || result?.status === "returned"
          ? "bg-red-950"
          : "bg-neutral-950";

  return (
    <div
      className={`min-h-screen ${bgClass} transition-colors duration-300 flex flex-col`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-medium text-neutral-200">Siap Kirim</span>
        <span className="text-xs text-neutral-400">
          {successCount} dikonfirmasi
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center p-4 gap-4">
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
                Siap kirim tercatat
              </p>
            )}
            {result.status === "duplicate" && (
              <p className="text-amber-400 font-semibold mb-1">
                Sudah dikonfirmasi {formatTime(result.packedAt)}
              </p>
            )}
            {result.status === "notfound" && (
              <p className="text-red-400 font-semibold mb-1">
                Resi tidak ditemukan -- belum dicetak lewat ekstensi?
              </p>
            )}
            {result.status === "returned" && (
              <p className="text-red-400 font-semibold mb-1">
                Resi ini sudah tercatat retur
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
            Scan barcode resi setelah label ditempel di paket
          </p>
        )}

        {/* Daftar resi yang sudah dicetak tapi belum dikonfirmasi */}
        {pendingLoaded && pending.length === 0 && (
          <div className="w-full max-w-md rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 text-sm text-center">
            Semua resi yang dicetak sudah dikonfirmasi siap kirim ✅
          </div>
        )}

        {pending.length > 0 && (
          <div className="w-full max-w-md">
            <p className="text-sm font-medium text-amber-400 mb-2">
              Belum siap kirim: {pending.length} resi
            </p>
            <div className="space-y-2">
              {pending.map((g) => {
                const age = ageInfo(g.soldAt);
                return (
                  <div
                    key={g.key}
                    className="rounded-xl bg-black/40 border border-white/10 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-neutral-100 break-all">
                          {g.key}
                        </p>
                        {g.orderNumber && g.orderNumber !== g.key && (
                          <p className="text-[11px] text-neutral-500">
                            No. Pesanan: {g.orderNumber}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-neutral-400">{g.store}</p>
                        <p className={`text-xs ${age.color}`}>{age.label}</p>
                      </div>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {g.items.map((it, i) => (
                        <p
                          key={i}
                          className="text-xs text-neutral-400 truncate"
                        >
                          {it.product} · {it.qty} pcs
                        </p>
                      ))}
                    </div>
                    <button
                      onClick={() => ignoreGroup(g)}
                      className="mt-2 text-[11px] text-neutral-500 hover:text-neutral-300"
                    >
                      Tandai dibatalkan
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
