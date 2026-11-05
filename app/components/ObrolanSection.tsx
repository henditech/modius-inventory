"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";

type AdminUser = "Hendi" | "Gita";

// Pesan Modi (tabel modius_chats)
type ChatMessage = {
  id: number;
  user_name: string;
  role: "user" | "model";
  content: string;
  created_at: string;
};

// Pesan antar admin (tabel chat_messages)
type AdminChatMessage = {
  id: string;
  sender: string;
  recipient: string;
  body: string;
  type: string;
  created_at: string;
};

// Bentuk seragam untuk dirender
type DisplayMessage = {
  id: string | number;
  role: "user" | "model" | "partner";
  content: string;
  created_at: string;
};

const CHAT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari (sinkron dengan cron di server)

function formatChatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatChatDate(iso: string) {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
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
  const userLabel = `Kak ${currentUser}`;

  const [activeTab, setActiveTab] = useState<"admin" | "modi">("modi");
  const [adminMessages, setAdminMessages] = useState<AdminChatMessage[]>([]);
  const [modiMessages, setModiMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false); // true sampai potongan pertama tiba
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // === Muat riwayat & pantau chat antar admin (real-time) ===
  // Catatan: balasan Modi SENGAJA tidak lewat Realtime. Balasan hanya
  // ditampilkan dari stream, jadi tidak mungkin dobel.
  useEffect(() => {
    loadHistory();

    const adminChannel = supabase
      .channel(`admin_chat_live_${currentUser}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: "type=eq.admin",
        },
        (payload) => {
          const msg = payload.new as AdminChatMessage;
          setAdminMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(adminChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Auto scroll ke bawah
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [modiMessages, adminMessages, aiTyping, activeTab]);

  // Muat riwayat dari Supabase
  // (penghapusan pesan lama dilakukan oleh pg_cron di server)
  async function loadHistory() {
    setLoading(true);
    const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();

    const { data: modiData } = await supabase
      .from("modius_chats")
      .select("*")
      .eq("user_name", userLabel)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true });

    if (!modiData || modiData.length === 0) {
      setModiMessages([
        {
          id: 0,
          user_name: userLabel,
          role: "model",
          content: `Halo ${userLabel}! Saya Modi, AI Modius 😊 Saat ini Modi masih dalam tahap pengembangan, jadi fitur pembuatan laporan belum tersedia ya. Ada hal lain yang bisa Modi bantu?`,
          created_at: new Date().toISOString(),
        },
      ]);
    } else {
      setModiMessages(modiData);
    }

    const { data: adminData } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("type", "admin")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true });

    setAdminMessages((adminData as AdminChatMessage[]) ?? []);
    setLoading(false);
  }

  // Kirim pesan ke partner (Hendi <-> Gita)
  async function sendToPartner(body: string) {
    setSending(true);
    setSendError("");
    setText("");

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ sender: currentUser, recipient: partner, body, type: "admin" })
      .select()
      .single();

    if (error || !data) {
      console.error("Error kirim pesan admin:", error);
      setText(body); // kembalikan teks supaya tidak hilang
      setSendError("Pesan gagal terkirim. Coba lagi ya.");
    } else {
      const sent = data as AdminChatMessage;
      setAdminMessages((prev) =>
        prev.some((m) => m.id === sent.id) ? prev : [...prev, sent],
      );
    }

    setSending(false);
  }

  // Kirim pesan ke Modi (streaming)
  async function sendToModi(body: string) {
    setText("");
    setSending(true);
    setAiTyping(true);
    setSendError("");

    const now = Date.now();
    const userMsgId = now;
    const modelMsgId = now + 1;

    // 1. Tampilkan pesan user langsung
    setModiMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        user_name: userLabel,
        role: "user",
        content: body,
        created_at: new Date().toISOString(),
      },
    ]);

    let modelBubbleCreated = false;

    // Tulis/ubah isi bubble Modi (dibuat saat potongan pertama datang)
    const writeModelContent = (content: string) => {
      if (!modelBubbleCreated) {
        modelBubbleCreated = true;
        setAiTyping(false); // indikator "mengetik" diganti bubble asli
        setModiMessages((prev) => [
          ...prev,
          {
            id: modelMsgId,
            user_name: userLabel,
            role: "model",
            content,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        setModiMessages((prev) =>
          prev.map((m) => (m.id === modelMsgId ? { ...m, content } : m)),
        );
      }
    };

    try {
      const res = await fetch("/api/modi-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: body, userName: currentUser }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      if (!res.body) throw new Error("Stream kosong");

      // 2. Baca stream dari server
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        if (accumulated) writeModelContent(accumulated);
      }
      accumulated += decoder.decode(); // buang sisa byte di decoder

      if (!modelBubbleCreated) {
        writeModelContent("Hmm, Modi belum bisa menjawab Kak. Coba lagi ya 😊");
      }
    } catch (err) {
      console.error("Error kirim pesan ke Modi:", err);
      writeModelContent("Aduh, koneksi ke Modi terputus Kak. Coba lagi ya 😊");
    } finally {
      setAiTyping(false);
      setSending(false);
    }
  }

  // Busy = sedang ada proses kirim di tab aktif
  const busy = sending;

  async function handleSend() {
    const body = text.trim();
    if (!body || busy) return;

    if (activeTab === "admin") {
      await sendToPartner(body);
    } else {
      await sendToModi(body);
    }
  }

  // Seragamkan dua sumber pesan untuk dirender
  const displayMessages: DisplayMessage[] =
    activeTab === "modi"
      ? modiMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        }))
      : adminMessages.map((m) => ({
          id: m.id,
          role: m.sender === currentUser ? "user" : "partner",
          content: m.body,
          created_at: m.created_at,
        }));

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
              ? `Ruang santai bareng ${partner}`
              : `Diskusi bareng Modi AI`}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-black/40 p-1 border border-line rounded-lg">
          <button
            onClick={() => {
              setActiveTab("admin");
              setSendError("");
            }}
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
            onClick={() => {
              setActiveTab("modi");
              setSendError("");
            }}
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
        {activeTab === "admin" && displayMessages.length === 0 && (
          <div className="h-full flex items-center justify-center text-xs text-neutral-600">
            Belum ada pesan. Sapa {partner} duluan yuk 👋
          </div>
        )}

        {displayMessages.map((m, i) => {
          const isUser = m.role === "user";
          const isModi = m.role === "model";
          const isPartner = m.role === "partner";
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
                      : isPartner
                        ? "bg-neutral-800 border border-neutral-700 text-neutral-100 rounded-bl-sm"
                        : "bg-accent-950/40 border border-accent-500/30 text-neutral-100 rounded-bl-sm"
                  }`}
                >
                  {isModi && (
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-accent-400 mb-1">
                      <span>✨ MODI</span>
                    </div>
                  )}
                  {isPartner && (
                    <div className="text-[11px] font-semibold text-neutral-400 mb-1">
                      {partner}
                    </div>
                  )}
                  <div className="break-words leading-relaxed">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-white">
                            {children}
                          </strong>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-5 mb-2 space-y-1">
                            {children}
                          </ol>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-5 mb-2 space-y-1">
                            {children}
                          </ul>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
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

        {/* Indikator Modi mengetik (hanya sampai potongan pertama tiba) */}
        {activeTab === "modi" && aiTyping && (
          <div className="flex justify-start">
            <div className="bg-accent-950/30 border border-accent-500/20 text-neutral-400 px-3 py-2 rounded-2xl rounded-bl-sm text-xs flex items-center gap-2">
              <span className="animate-pulse">✨ MODI sedang mengetik...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* PESAN ERROR */}
      {sendError && (
        <div className="mt-2 text-xs text-red-400">{sendError}</div>
      )}

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
          maxLength={2000}
          placeholder={
            activeTab === "modi"
              ? "Ngobrol atau tanya apa saja ke Modi…"
              : `Tulis pesan untuk ${partner}…`
          }
          className="flex-1 bg-black/40 border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-500 placeholder:text-neutral-600"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || busy}
          className="shine-btn bg-accent-500 hover:bg-accent-400 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          {activeTab === "modi" && busy ? "Memikirkan..." : "Kirim"}
        </button>
      </div>
    </div>
  );
}
