import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// === Cek di awal biar jelas kenapa gagal ===
if (!supabaseUrl) {
  throw new Error("❌ NEXT_PUBLIC_SUPABASE_URL tidak ditemukan!");
}
if (!serviceKey) {
  throw new Error(
    "❌ SUPABASE_SERVICE_ROLE_KEY tidak ditemukan! — Pastikan dipasang di Vercel Environment Variables",
  );
}

export const supabaseAdmin = createClient(supabaseUrl!, serviceKey!, {
  auth: { persistSession: false },
});

// Fungsi untuk mengambil riwayat percakapan
export async function getChatHistory() {
  const { data, error } = await supabaseAdmin
    .from("modius_chats")
    .select("role, content")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Gagal ambil history:", error);
    return [];
  }
  return data || [];
}

// Fungsi untuk menyimpan chat baru
export async function saveChat(
  userName: string,
  role: "user" | "model",
  content: string,
) {
  const { error } = await supabaseAdmin
    .from("modius_chats")
    .insert([{ user_name: userName, role, content }]);

  if (error) {
    console.error("❌ Gagal simpan chat:", error);
    throw error; // Lempar ke pemanggil biar jelas
  }
  return true;
}

// Fungsi untuk mengambil memori jangka panjang
export async function getModiMemory() {
  const { data, error } = await supabaseAdmin
    .from("modi_memory")
    .select("persona_notes")
    .eq("id", 1)
    .single();

  if (error || !data) {
    console.log("ℹ️ Belum ada memori khusus");
    return "Belum ada preferensi khusus.";
  }
  return data.persona_notes;
}

// Fungsi untuk memperbarui memori
export async function updateModiMemory(newNotes: string) {
  const { error } = await supabaseAdmin.from("modi_memory").upsert({
    id: 1,
    persona_notes: newNotes,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("❌ Gagal perbarui memori:", error);
    throw error;
  }
  return true;
}
