"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase"; // Sesuaikan path supabase kamu

type AdminUser = "Hendi" | "Gita";

type ChatMessage = {
  id: string;
  sender: AdminUser | "Modi";
  body: string;
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
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
  });
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

  // Tab Active: Mode obrolan dengan Partner (Admin) atau MODI (AI)
  const [activeTab, setActiveTab] = useState<"admin" | "modi">("admin");

  // State Pesan Terpisah
  const [adminMessages, setAdminMessages] = useState<ChatMessage[]>([]);
  const [modiMessages, setModiMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-modi",
      sender: "Modi",
      body: `Halo ${currentUser}! Saya Modi, asisten AI Modius. Ada yang bisa saya bantu terkait stok, analisis iklan, laporan hari ini, atau ngobrol santai?`,
      created_at: new Date().toISOString(),
    },
  ]);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Realtime & Load data khusus Pesan Admin
  useEffect(() => {
    loadAdminMessages();

    const channel = supabase
      .channel("chat_messages_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          setAdminMessages((prev) => [...prev, payload.new as ChatMessage]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto scroll ke paling bawah saat ada pesan baru
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [adminMessages, modiMessages, activeTab, aiTyping]);

  async function loadAdminMessages() {
    setLoading(true);
    // Bersihkan pesan admin yang lebih dari 24 jam
    const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();
    await supabase.from("chat_messages").delete().lt("created_at", cutoff);

    // Ambil sisa pesan admin
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true });

    setAdminMessages((data as ChatMessage[]) ?? []);
    setLoading(false);
  }

  async function askGemini(userInput: string) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userInput }),
    });

    const data = await res.json();
    console.log("Jawaban Gemini:", data.text);
  }

  // Kirim Pesan (Logic terpisah berdasarkan activeTab)
  async function handleSend() {
    const body = text.trim();
    if (!body || sending || aiTyping) return;

    if (activeTab === "admin") {
      // --- MODE CHAT ADMIN ---
      setSending(true);
      setText("");

      const { error } = await supabase.from("chat_messages").insert({
        sender: currentUser,
        body,
      });

      if (error) {
        console.error(error);
        setText(body); // Kembalikan teks jika gagal
      }
      setSending(false);
    } else {
      // --- MODE CHAT MODI (AI) ---
      setText("");
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: currentUser,
        body,
        created_at: new Date().toISOString(),
      };

      // Tambahkan pesan user ke UI MODI
      setModiMessages((prev) => [...prev, userMsg]);
      setAiTyping(true);

      try {
        // Panggil API Gemini
        const res = await fetch("/api/modi-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: body,
            user: currentUser,
            history: modiMessages.slice(-6),
          }),
        });

        const data = await res.json();

        const modiReply: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: "Modi",
          body: data.reply || "Maaf, Modi sedang mengalami kendala jaringan.",
          created_at: new Date().toISOString(),
        };

        setModiMessages((prev) => [...prev, modiReply]);
      } catch (err) {
        console.error(err);
        setModiMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            sender: "Modi",
            body: "Aduh, koneksi ke Modi terputus. Coba lagi ya!",
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setAiTyping(false);
      }
    }
  }

  // Pilih dataset pesan mana yang ditampilkan berdasarkan Tab
  const currentDisplayMessages =
    activeTab === "admin" ? adminMessages : modiMessages;

  return (
    <div className="animate-fadeIn max-w-2xl mx-auto flex flex-col h-[calc(100vh-160px)]">
      {/* HEADER & TAB SWITCHER */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">Diskusi</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {activeTab === "admin"
              ? `Obrolan internal bersama ${partner}`
              : "Diskusi & Analisis Bisnis bersama MODI AI"}
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-black/40 p-1 border border-line rounded-lg self-start sm:self-auto">
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

      {/* CHAT CONTAINER */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-line bg-panel/50 p-4 space-y-3">
        {currentDisplayMessages.map((m, i) => {
          const mine = m.sender === currentUser;
          const isModi = m.sender === "Modi";
          const prev = currentDisplayMessages[i - 1];
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
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm ${
                    mine
                      ? "bg-accent-500 text-white rounded-br-sm"
                      : isModi
                        ? "bg-accent-950/40 border border-accent-500/30 text-neutral-100 rounded-bl-sm"
                        : "bg-white/5 border border-line text-neutral-100 rounded-bl-sm"
                  }`}
                >
                  {/* Badge Identitas jika balasan dari MODI */}
                  {isModi && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-accent-400 mb-1">
                      <span>✨ MODI</span>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {m.body}
                  </p>
                  <span
                    className={`block text-[10px] mt-1.5 ${
                      mine ? "text-white/70" : "text-neutral-500"
                    }`}
                  >
                    {formatChatTime(m.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Indicator saat MODI sedang berpikir */}
        {activeTab === "modi" && aiTyping && (
          <div className="flex justify-start">
            <div className="bg-accent-950/30 border border-accent-500/20 text-neutral-400 px-3 py-2 rounded-2xl rounded-bl-sm text-xs flex items-center gap-2">
              <span className="animate-pulse">✨ MODI sedang mengetik...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* INPUT BOX */}
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
            activeTab === "admin"
              ? `Tulis pesan untuk ${partner}…`
              : "Tanya MODI tentang stok, iklan, atau laporan…"
          }
          className="flex-1 bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 placeholder:text-neutral-600"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending || aiTyping}
          className="shine-btn bg-accent-500 hover:bg-accent-400 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          {activeTab === "modi" && aiTyping ? "Memikirkan..." : "Kirim"}
        </button>
      </div>
    </div>
  );
}
