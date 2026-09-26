import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// Fungsi untuk mengambil 10 chat terakhir (Urutan dari lama ke baru)
export async function getChatHistory() {
  const { data, error } = await supabaseAdmin
    .from("modius_chats")
    .select("role, content")
    .order("created_at", { ascending: true }); // Penting: urutan maju agar AI paham alur

  if (error) {
    console.error("Gagal ambil history:", error);
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

  if (error) console.error("Gagal simpan chat:", error);
}

// Fungsi untuk mengambil memori jangka panjang Modi
export async function getModiMemory() {
  const { data, error } = await supabaseAdmin
    .from("modi_memory")
    .select("persona_notes")
    .eq("id", 1)
    .single();

  if (error || !data) return "Belum ada preferensi khusus.";
  return data.persona_notes;
}

// Fungsi untuk memperbarui memori jangka panjang Modi
export async function updateModiMemory(newNotes: string) {
  await supabaseAdmin
    .from("modi_memory")
    .upsert({ id: 1, persona_notes: newNotes, updated_at: new Date() });
}
