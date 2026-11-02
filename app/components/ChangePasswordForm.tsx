"use client";

import { useState, type FormEvent } from "react";

// Form "Ganti password" di halaman login. Tampilannya mengikuti form password
// di app/page.tsx (kelas logo-shine dan logo-glow dari style global halaman itu).
export default function ChangePasswordForm({
  userKey,
  displayName,
  avatarSrc,
  onSuccess,
  onBack,
}: {
  userKey: string;
  displayName: string;
  avatarSrc: string;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!current) {
      setError("Isi password lama dulu");
      return;
    }
    if (next.length < 8) {
      setError("Password baru minimal 8 karakter");
      return;
    }
    if (next !== again) {
      setError("Ulangi password baru belum sama");
      return;
    }
    if (next === current) {
      setError("Password baru harus beda dari yang lama");
      return;
    }
    if (hint.trim() && hint.trim().length < 2) {
      setError("Kata rahasia minimal 2 karakter");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userKey,
          currentPassword: current,
          newPassword: next,
          hint,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal mengganti password, coba lagi");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Gagal menghubungi server, coba lagi");
      setLoading(false);
    }
  }

  const inputClass =
    "w-full bg-black/40 border border-neutral-700 rounded-lg px-4 py-3.5 text-center text-lg mb-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm relative animate-fadeIn"
    >
      <div className="relative logo-shine rounded-3xl w-fit mx-auto mb-8">
        <div className="logo-glow" />
        <img
          src={avatarSrc}
          alt={displayName}
          className="w-24 h-24 rounded-full object-cover"
        />
      </div>
      <h1 className="text-2xl font-semibold mb-1 text-center">
        Ganti password, {displayName}
      </h1>
      <p className="text-sm text-neutral-500 mb-6 text-center">
        Password baru minimal 8 karakter
      </p>

      <input
        type="password"
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value);
          setError("");
        }}
        placeholder="Password lama..."
        className={inputClass}
        autoFocus
      />
      <input
        type="password"
        value={next}
        onChange={(e) => {
          setNext(e.target.value);
          setError("");
        }}
        placeholder="Password baru..."
        className={inputClass}
      />
      <input
        type="password"
        value={again}
        onChange={(e) => {
          setAgain(e.target.value);
          setError("");
        }}
        placeholder="Ulangi password baru..."
        className={inputClass}
      />
      <input
        type="text"
        value={hint}
        onChange={(e) => {
          setHint(e.target.value);
          setError("");
        }}
        placeholder="Kata rahasia baru (kosongkan kalau tidak diganti)"
        className="w-full bg-black/40 border border-neutral-700 rounded-lg px-4 py-3.5 text-center text-sm mb-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
      />

      {error && (
        <p className="text-red-400 text-sm text-center mb-3">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white py-3.5 rounded-lg font-semibold transition-colors mb-4"
      >
        {loading ? "Menyimpan..." : "Simpan password baru"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-neutral-500 hover:text-neutral-300"
      >
        &larr; Kembali
      </button>
    </form>
  );
}
