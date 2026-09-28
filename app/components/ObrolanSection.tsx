"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type AdminUser = "Hendi" | "Gita";
type ChatMessage = {
  id: number;
  user_name: string;
  role: "user" | "model";
  content: string;
  created_at: string;
};

const CHAT_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

function formatChatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}
function formatChatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "Hari ini";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long" });
}

export default function ObrolanSection({
  currentUser,
  onlineUsers,
}: {
  currentUser: AdminUser;
  onlineUsers: string[];
}) {
  const partner: AdminUser = currentUser === "Hendi" ? "Gita" : "Hendi";
  const partnerOnline = onlineUsers.includes(partner);

  const [activeTab, setActiveTab] = useState<"admin" | "modi">("modi");
  const [adminMessages, setAdminMessages] = useState<ChatMessage[]>([]);
  const [modiMessages, setModiMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // === Muat Riwayat & Pantau Real-time ===
  useEffect(() => {
    loadHistory();

    // Pantau pesan baru masuk dari modius_chats
    const channel = supabase
      .channel("modi_chat_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "modius_chats" },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          // Tampilkan hanya untuk pengguna yang sedang aktif
          if (newMsg.user_name === `Kak ${currentUser}`) {
            setModiMessages((prev) => [...prev, newMsg]);
            // Sembunyikan indikator mengetik kalau balasan sudah muncul
            if (newMsg.role === "model") {
              setAiTyping(false);
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Auto scroll ke bawah
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [modiMessages, aiTyping, activeTab]);

  // Muat riwayat dari Supabase
  async function loadHistory() {
    setLoading(true);
    const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();
    const userLabel = `Kak ${currentUser}`;

    // Hapus pesan yang sudah lewat 24 jam
    await supabase.from("modius_chats").delete().lt("created_at", cutoff);

    // Ambil riwayat untuk pengguna saat ini
    const { data } = await supabase
      .from("modius_chats")
      .select("*")
      .eq("user_name", userLabel)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true });

    if (!data || data.length === 0) {
      // Pesan sambutan jika belum ada riwayat
      setModiMessages([
        {
          id: 0,
          user_name: userLabel,
          role: "model",
          content: `Halo ${userLabel}! Saya Modi, asisten AI Modius. Ada yang bisa saya bantu terkait stok, analisis iklan, laporan hari ini, atau ngobrol santai?`,
          created_at: new Date().toISOString(),
        },
      ]);
    } else {
      setModiMessages(data);
    }

    setLoading(false);
  }

  // Kirim pesan ke Modi
  async function handleSend() {
    const body = text.trim();
    if (!body || sending || aiTyping) return;

    setText("");
    setSending(true);
    setAiTyping(true);

    const userLabel = `Kak ${currentUser}`;

    try {
      // Simpan pesan user — lewat API atau langsung sesuai sistem kamu
      const res = await fetch("/api/modi-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: body,
          userName: currentUser,
        }),
      });

      if (!res.ok) throw new Error("Gagal kirim ke API");
      // Balasan akan muncul otomatis lewat realtime dari Supabase
    } catch (err) {
      console.error("Error kirim pesan:", err);
      setAiTyping(false);
      // Tampilkan pesan error
      const errorMsg: ChatMessage = {
        id: Date.now(),
        user_name: userLabel,
        role: "model",
        content: "Aduh, koneksi ke Modi terputus. Coba lagi ya!",
        created_at: new Date().toISOString(),
      };
      setModiMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  }

  // Tampilkan sesuai tab
  const displayMessages = activeTab === "modi" ? modiMessages : adminMessages;

  if (loading) {
    return (
      <div className="p-4 text-center text-neutral-400">
        Memuat riwayat obrolan...
      </div>
    );
  }

  return (
    <div className="animate-fadeIn max-w-2xl mx-auto flex flex-col h-[calc(100vh-160px)]">
      {/* HEADER & TAB */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">Diskusi</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {activeTab === "admin"
              ? `Obrolan internal bersama ${partner}`
              : "Diskusi & Analisis Bisnis bersama MODI AI"}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-black/40 p-1 border border-line rounded-lg">
          <button
            onClick={() => setActiveTab("admin")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "admin"
                ? "bg-neutral-800 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                partnerOnline ? "bg-emerald-400" : "bg-neutral-600"
              }`}
            />
            {partner}
          </button>
          <button
            onClick={() => setActiveTab("modi")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "modi"
                ? "bg-accent-500/20 text-accent-400 border border-accent-500/30"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span>✨</span> MODI AI
          </button>
        </div>
      </div>

      {/* DAFTAR PESAN */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-line bg-panel/50 p-4 space-y-3">
        {displayMessages.map((m, i) => {
          const isUser = m.role === "user";
          const isModi = m.role === "model";
          const prev = displayMessages[i - 1];
          const showDateDivider =
            !prev ||
            new Date(prev.created_at).toDateString() !==
              new Date(m.created_at).toDateString();

          return (
            <div key={m.id}>
              {showDateDivider && (
                <div className="text-center text-[11px] text-neutral-600 my-3">
                  {formatChatDate(m.created_at)}
                </div>
              )}
              <div
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm ${
                    isUser
                      ? "bg-accent-500 text-white rounded-br-sm"
                      : "bg-accent-950/40 border border-accent-500/30 text-neutral-100 rounded-bl-sm"
                  }`}
                >
                  {isModi && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-accent-400 mb-1">
                      <span>✨ MODI</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {m.content}
                  </p>
                  <span
                    className={`block text-[10px] mt-1.5 ${
                      isUser ? "text-white/70" : "text-neutral-500"
                    }`}
                  >
                    {formatChatTime(m.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Indikator Modi Mengetik */}
        {activeTab === "modi" && aiTyping && (
          <div className="flex justify-start">
            <div className="bg-accent-950/30 border border-accent-500/20 text-neutral-400 px-3 py-2 rounded-2xl rounded-bl-sm text-xs flex items-center gap-2">
              <span className="animate-pulse">✨ MODI sedang mengetik...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* KOTAK KETIK & KIRIM */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            activeTab === "modi"
              ? "Tanya MODI tentang stok, iklan, atau laporan…"
              : `Tulis pesan untuk ${partner}…`
          }
          className="flex-1 bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 placeholder:text-neutral-600"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending || aiTyping}
          className="shine-btn bg-accent-500 hover:bg-accent-400 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          {aiTyping ? "Memikirkan..." : "Kirim"}
        </button>
      </div>
    </div>
  );
}
