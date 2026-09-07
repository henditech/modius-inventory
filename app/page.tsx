"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const AVATARS: Record<string, string> = {
  Hendi: "/avatars/hendi.png",
  Gita: "/avatars/gita.png",
};

const ROUTES: Record<
  string,
  { path: string; asUser?: "Hendi" | "Gita"; displayName: string }
> = {
  "pak wawan": { path: "/produksi", displayName: "Pak Wawan" },
  wawan: { path: "/produksi", displayName: "Pak Wawan" },
  "ibu bos": { path: "/ibu-bos", displayName: "Ibu Bos" },
  "bu bos": { path: "/ibu-bos", displayName: "Ibu Bos" },
  hendi: { path: "/admin", asUser: "Hendi", displayName: "Hendi" },
  gita: { path: "/admin", asUser: "Gita", displayName: "Gita" },
};

const GREETING_LINES = [
  "Let's get things rolling.",
  "Ready when you are.",
  "Time to make some magic happen.",
  "Let's build something great today.",
  "Good to have you back.",
];

type Greeting = {
  displayName: string;
  line: string;
  path: string;
};

// Berapa lama greeting tampil normal sebelum efek portal mulai
const HOLD_MS = 700;
// Durasi animasi portal (blur + zoom-out + flash)
const PORTAL_MS = 650;

export default function HomePage() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  const [portalLeaving, setPortalLeaving] = useState(false);
  const router = useRouter();

  // Begitu greeting tampil: tunggu sebentar, mulai efek portal, lalu pindah halaman
  useEffect(() => {
    if (!greeting) return;
    const zoomTimer = setTimeout(() => setPortalLeaving(true), HOLD_MS);
    const navTimer = setTimeout(
      () => router.push(greeting.path),
      HOLD_MS + PORTAL_MS,
    );
    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(navTimer);
    };
  }, [greeting, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = name.trim().toLowerCase();
    const match = ROUTES[key];

    if (!match) {
      setError("Nama tidak dikenali, coba ketik ulang");
      return;
    }

    if (match.asUser) {
      sessionStorage.setItem("modiusUser", match.asUser);
    }

    const line =
      GREETING_LINES[Math.floor(Math.random() * GREETING_LINES.length)];
    setGreeting({ displayName: match.displayName, line, path: match.path });
  }

  const footer = (
    <p className="fixed bottom-4 inset-x-0 z-10 text-center text-[11px] text-neutral-600 tracking-wide select-none">
      Handcrafted with <span className="text-red-400">❤</span> by{" "}
      <span className="text-[#7c96ff]">Gita Dev Team</span>
    </p>
  );

  const backdrop = (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />
    </div>
  );

  const styles = (
    <style jsx global>{`
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-fadeIn {
        animation: fadeIn 0.4s ease-out forwards;
      }

      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .stagger {
        opacity: 0;
        animation: fadeInUp 0.6s ease-out forwards;
      }

      @keyframes logoEntrance {
        0% {
          opacity: 0;
          transform: scale(0.4) rotate(-8deg);
        }
        55% {
          opacity: 1;
          transform: scale(1.1) rotate(2deg);
        }
        75% {
          transform: scale(0.96) rotate(-1deg);
        }
        100% {
          opacity: 1;
          transform: scale(1) rotate(0deg);
        }
      }
      .logo-entrance {
        animation: logoEntrance 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes glowPulse {
        0%,
        100% {
          opacity: 0.35;
          transform: scale(1);
        }
        50% {
          opacity: 0.65;
          transform: scale(1.1);
        }
      }
      .logo-glow {
        position: absolute;
        inset: -22px;
        border-radius: 9999px;
        background: radial-gradient(
          circle,
          rgba(91, 127, 255, 0.55),
          transparent 70%
        );
        filter: blur(28px);
        animation: glowPulse 3.2s ease-in-out infinite;
        z-index: 0;
      }

      @keyframes shineSweep {
        0% {
          left: -60%;
        }
        22% {
          left: 130%;
        }
        100% {
          left: 130%;
        }
      }
      .logo-shine {
        position: relative;
        overflow: hidden;
        z-index: 1;
      }
      .logo-shine::after {
        content: "";
        position: absolute;
        top: 0;
        left: -60%;
        width: 45%;
        height: 100%;
        background: linear-gradient(
          115deg,
          transparent 20%,
          rgba(255, 255, 255, 0.16) 45%,
          rgba(255, 255, 255, 0.38) 50%,
          rgba(255, 255, 255, 0.16) 55%,
          transparent 80%
        );
        transform: skewX(-20deg);
        animation: shineSweep 4.5s ease-in-out 1.3s infinite;
        pointer-events: none;
      }

      @keyframes floatOrb {
        0%,
        100% {
          transform: translate(0, 0);
        }
        50% {
          transform: translate(24px, -32px);
        }
      }
      .orb {
        position: absolute;
        border-radius: 9999px;
        filter: blur(70px);
        opacity: 0.22;
        animation: floatOrb 11s ease-in-out infinite;
      }
      .orb-a {
        width: 420px;
        height: 420px;
        top: -120px;
        left: -100px;
        background: #5b7fff;
      }
      .orb-b {
        width: 360px;
        height: 360px;
        bottom: -140px;
        right: -80px;
        background: #7c5bff;
        animation-delay: -4s;
      }
      .orb-c {
        width: 260px;
        height: 260px;
        bottom: 10%;
        left: 8%;
        background: #5bc4ff;
        animation-delay: -7s;
        opacity: 0.14;
      }

      /* --- Efek portal saat pindah halaman --- */
      @keyframes portalZoomOut {
        0% {
          opacity: 1;
          transform: scale(1);
          filter: blur(0px);
        }
        100% {
          opacity: 0;
          transform: scale(0.72);
          filter: blur(14px);
        }
      }
      .portal-leaving .portal-content {
        animation: portalZoomOut ${PORTAL_MS}ms cubic-bezier(0.4, 0, 0.2, 1)
          forwards;
      }

      @keyframes portalFlash {
        0% {
          opacity: 0;
          transform: scale(0.8);
        }
        45% {
          opacity: 0.85;
          transform: scale(1.4);
        }
        100% {
          opacity: 0;
          transform: scale(2.2);
        }
      }
      .portal-flash {
        position: fixed;
        inset: 0;
        z-index: 40;
        pointer-events: none;
        opacity: 0;
        background: radial-gradient(
          circle,
          rgba(140, 170, 255, 0.9),
          rgba(91, 127, 255, 0.25) 45%,
          transparent 72%
        );
      }
      .portal-leaving .portal-flash {
        animation: portalFlash ${PORTAL_MS}ms ease-out forwards;
      }
    `}</style>
  );

  if (greeting) {
    return (
      <div
        className={`min-h-screen bg-[#0a0b0e] text-white flex flex-col items-center justify-center px-4 relative ${
          portalLeaving ? "portal-leaving" : ""
        }`}
      >
        {backdrop}
        <div className="portal-flash" />
        <div className="portal-content flex flex-col items-center">
          <div className="relative logo-shine rounded-3xl">
            <div className="logo-glow" />
            <img
              src={AVATARS[greeting.displayName] || "/logo.png"}
              alt={greeting.displayName}
              className={`w-28 h-28 mb-6 animate-fadeIn ${
                AVATARS[greeting.displayName]
                  ? "rounded-full object-cover"
                  : "object-contain"
              }`}
            />
          </div>
          <p className="text-2xl font-semibold mb-2 animate-fadeIn">
            Welcome back, {greeting.displayName}
          </p>
          <p className="text-neutral-500 animate-fadeIn">{greeting.line}</p>
        </div>
        {styles}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white flex items-center justify-center px-4 relative">
      {backdrop}
      <form onSubmit={handleSubmit} className="w-full max-w-sm relative">
        <div className="relative logo-shine rounded-3xl w-fit mx-auto mb-8">
          <div className="logo-glow" />
          <img
            src="/logo.png"
            alt="Modius.id"
            className="relative logo-entrance w-50 h-50 object-contain"
          />
        </div>
        <h1
          className="stagger text-2xl font-semibold mb-1 text-center"
          style={{ animationDelay: "0.85s" }}
        >
          Modius System
        </h1>
        <p
          className="stagger text-sm text-neutral-500 mb-8 text-center"
          style={{ animationDelay: "0.95s" }}
        >
          Ketik nama kamu untuk masuk
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          placeholder="Nama kamu..."
          className="stagger w-full bg-black/40 border border-neutral-700 rounded-lg px-4 py-3.5 text-center text-lg mb-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
          style={{ animationDelay: "1.05s" }}
          autoFocus
        />
        {error && (
          <p className="text-red-400 text-sm text-center mb-3">{error}</p>
        )}
        <button
          type="submit"
          className="stagger w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-lg font-semibold transition-colors"
          style={{ animationDelay: "1.15s" }}
        >
          Masuk
        </button>
      </form>
      {footer}
      {styles}
    </div>
  );
}
