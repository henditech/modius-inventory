"use client";

import { useCallback, useEffect, useState } from "react";
import type { DanaData, DanaEmpty } from "@/lib/analytics/dana";
import type { DateRange } from "@/lib/analytics/danaRange";

export type DanaStore = {
  id: string;
  code: string;
  name: string;
  username: string | null;
};

export type DanaState = {
  admin: string | null;
  stores: DanaStore[];
  storeId: string;
  setStoreId: (id: string) => void;
  range: DateRange | null; // pilihan pengguna; null = otomatis (ditentukan server dari data)
  setRange: (r: DateRange | null) => void;
  effectiveRange: DateRange | null; // yang sedang tampil
  data: DanaData | DanaEmpty | null; // hanya untuk toko yang sedang dipilih
  loading: boolean;
  error: string | null;
  sessionExpired: boolean;
  reload: () => void;
};

// Dipakai bersama oleh tab Penghasilan dan Saldo (satu pilihan toko dan rentang untuk keduanya).
// `enabled` baru true begitu salah satu tab itu dibuka, supaya tab Upload tidak memuat data.
export function useDana(enabled: boolean): DanaState {
  const [admin, setAdmin] = useState<string | null>(null);
  const [stores, setStores] = useState<DanaStore[]>([]);
  const [storeId, setStoreIdState] = useState("");
  const [range, setRangeState] = useState<DateRange | null>(null);
  const [raw, setRaw] = useState<DanaData | DanaEmpty | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [booted, setBooted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // 1. Daftar toko milik admin yang login (sekali).
  useEffect(() => {
    if (!enabled || booted) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/me");
        if (cancelled) return;
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat daftar toko.");
          return;
        }
        setAdmin(json.admin);
        setStores(json.stores);
        // Satu toko saja: pilih otomatis. Lebih dari satu: dipilih sendiri supaya tidak salah toko.
        if (json.stores.length === 1) setStoreIdState(json.stores[0].id);
        setBooted(true);
      } catch {
        if (!cancelled) setError("Gagal menghubungi server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, booted]);

  // 2. Data untuk toko dan rentang yang dipilih.
  useEffect(() => {
    if (!enabled || !storeId) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ store: storeId });
        if (range) {
          qs.set("from", range.from);
          qs.set("to", range.to);
        }
        const res = await fetch(`/api/analytics/dana?${qs.toString()}`, {
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          setSessionExpired(true);
          return;
        }
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.error ?? "Gagal memuat data.");
          setRaw(null);
          return;
        }
        setRaw(json as DanaData | DanaEmpty);
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError("Gagal menghubungi server.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [enabled, storeId, range, reloadKey]);

  const setStoreId = useCallback((id: string) => {
    setStoreIdState(id);
    setRangeState(null); // cakupan data tiap toko beda, kembali ke otomatis
    setError(null);
  }, []);
  const setRange = useCallback((r: DateRange | null) => setRangeState(r), []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const data = raw && storeId && raw.store.id === storeId ? raw : null;
  const effectiveRange = range ?? (data && !data.empty ? data.range : null);

  return {
    admin,
    stores,
    storeId,
    setStoreId,
    range,
    setRange,
    effectiveRange,
    data,
    loading,
    error,
    sessionExpired,
    reload,
  };
}
