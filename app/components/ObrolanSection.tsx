"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

type AdminUser = "Hendi" | "Gita";
type ChatMessage = {
  id: string;
  sender: AdminUser | "Modi";
  body: string;
  created_at: string;
  type?: "admin" | "modi"; // ← bedakan pesan
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

  const [activeTab, setActiveTab] = useState<"admin" | "modi">("admin");
  const [adminMessages, setAdminMessages] = useState<ChatMessage[]>([]);
  const [modiMessages, setModiMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // === LOAD RIWAYAT MODI DARI SUPABASE ===
  useEffect(() => {
    loadAllMessages();
    const channel = supabase
      .channel("chat_messages_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.type === "modi") {
            setModiMessages((prev) => [...prev, msg]);
          } else {
            setAdminMessages((prev) => [...prev, msg]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [adminMessages, modiMessages, activeTab, aiTyping]);

  async function loadAllMessages() {
    setLoading(true);
    const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();

    // Hapus pesan yang sudah lewat 24 jam
    await supabase.from("chat_messages").delete().lt("created_at", cutoff);

    // Ambil pesan Admin
    const { data: adminData } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("type", "admin")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true });

    // Ambil pesan Modi sesuai pengguna
    const { data: modiData } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("type", "modi")
      .eq("recipient", currentUser) // ← supaya masing-masing punya riwayat sendiri
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true });

    // Jika belum ada riwayat Modi → tampilkan pesan sambutan
    if (!modiData || modiData.length === 0) {
      setModiMessages([
        {
          id: "welcome-modi",
          sender: "Modi",
          body: `Halo ${currentUser}! Saya Modi, asisten AI Modius. Ada yang bisa saya bantu terkait stok, analisis iklan, laporan hari ini, atau ngobrol santai?`,
          created_at: new Date().toISOString(),
        },
      ]);
    } else {
      setModiMessages(modiData as ChatMessage[]);
    }

    setAdminMessages((adminData as ChatMessage[]) ?? []);
    setLoading(false);
  }

  async function handleSend() {
    const body = text.trim();
    if (!body || sending || aiTyping) return;

    if (activeTab === "admin") {
      // === MODE CHAT ADMIN ===
      setSending(true);
      setText("");
      const { error } = await supabase.from("chat_messages").insert({
        sender: currentUser,
        body,
        type: "admin",
      });
      if (error) {
        console.error(error);
        setText(body);
      }
      setSending(false);
    } else {
      // === MODE CHAT MODI ===
      setText("");
      setAiTyping(true);

      // Simpan pesan user ke Supabase
      const userMsg = {
        sender: currentUser,
        body,
        type: "modi",
        recipient: currentUser, // ← pemilik sesi ini
      };
      const { error: insertErr } = await supabase
        .from("chat_messages")
        .insert(userMsg);
      if (insertErr) console.error("Gagal simpan pesan user:", insertErr);

      try {
        const res = await fetch("/api/modi-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: body,
            userName: currentUser,
          }),
        });
        const data = await res.json();

        // Simpan jawaban Modi ke Supabase
        await supabase.from("chat_messages").insert({
          sender: "Modi",
          body: data.reply || "Maaf, Modi sedang mengalami kendala jaringan.",
          type: "modi",
          recipient: currentUser,
        });
        // Realtime akan otomatis menambah ke state, jadi tidak perlu set manual
      } catch (err) {
        console.error(err);
        await supabase.from("chat_messages").insert({
          sender: "Modi",
          body: "Aduh, koneksi ke Modi terputus. Coba lagi ya!",
          type: "modi",
          recipient: currentUser,
        });
      } finally {
        setAiTyping(false);
      }
    }
  }

  const currentDisplayMessages =
    activeTab === "admin" ? adminMessages : modiMessages;

  if (loading)
    return (
      <div className="p-4 text-center text-neutral-400">Memuat riwayat...</div>
    );

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
