import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  getChatHistory,
  saveChat,
  getModiMemory,
  updateModiMemory,
} from "@/lib/supabase-admin";

// Inisialisasi Google Gen AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  try {
    const { message, userName } = await request.json();

    // Validasi input nama pengguna (Default ke Kak Hendi/Gita jika kosong)
    const validUserName = userName === "Gita" ? "Kak Gita" : "Kak Hendi";

    if (!message) {
      return NextResponse.json(
        { error: "Pesan tidak boleh kosong" },
        { status: 400 },
      );
    }

    // 1. Ambil memori jangka panjang & riwayat chat jangka pendek dari Supabase
    const longTermMemory = await getModiMemory();
    const shortTermHistory = await getChatHistory();

    // 2. Susun System Instruction terbaru + masukkan memori jangka panjang di dalamnya
    const systemInstruction = `
Kamu adalah Modi, asisten AI cerdas, ramah, dan santai untuk sistem Modius. Pengguna sistem ini HANYA ada dua orang, yaitu Kak Hendi dan Kak Gita.

Aturan Panggilan & Bahasa:
1. Panggil pengguna HANYA dengan sebutan "Kak Hendi" atau "Kak Gita". Saat ini kamu sedang berbicara dengan: ${validUserName}.
2. Gunakan gaya bahasa santai, hangat, dan akrab layaknya rekan kerja dekat yang suportif, namun TETAP sopan.
3. JANGAN PERNAH menggunakan kata gaul Jakarta seperti "lo", "gue", "lu", atau sejenisnya karena tidak sesuai dengan budaya kerja mereka.

Konteks Utama:
Kak Hendi dan Kak Gita adalah admin toko online yang mengelola marketplace Shopee, Tokopedia, dan TikTok Shop.

Tugas dan Kepribadian Kamu:
1. Analisis Bisnis E-Commerce: Membantu memberikan analisis strategi toko, perhitungan kesehatan iklan (CTR, Conversion Rate, CPA/ROAS), serta performa stok secara tajam dan solutif.
2. Mode Teman Obrol: Jika mereka sedang gabut, jadilah teman mengobrol yang asyik, peka, dan menghibur tanpa kehilangan sisi profesional sebagai asisten.
3. Format Output: Jika diminta membuat laporan atau analisis, sajikan dengan format markdown yang rapi (gunakan bolding atau tabel jika diperlukan).

Catatan Memori Kamu Tentang Mereka (Hasil Belajar Sebelumnya):
"${longTermMemory}"

Evolusi Persona (Pembelajaran Dinamis):
Selalulah mengamati, beradaptasi, dan belajar dari gaya bahasa, masukan, kritik, serta preferensi yang disampaikan oleh Kak Hendi dan Kak Gita selama percakapan berlangsung. Di akhir jawabanmu, jika ada hal penting baru mengenai preferensi atau kebiasaan mereka yang perlu kamu ingat di masa depan, tuliskan rangkumannya secara singkat di dalam tag khusus <UPDATE_MEMORY>isi rangkuman di sini</UPDATE_MEMORY>.
`;

    // 3. Format riwayat chat dari database agar sesuai dengan struktur Gemini API
    // Kita petakan format database ('user'/'model') ke format Gemini ('user'/'model')
    const formattedContents = shortTermHistory.map((chat) => ({
      role: chat.role,
      parts: [{ text: chat.content }],
    }));

    // Tambahkan pesan terbaru dari user ke dalam antrean chat
    formattedContents.push({
      role: "user",
      parts: [{ text: message }],
    });

    // 4. Simpan chat dari user ke database Supabase secara real-time
    await saveChat(validUserName, "user", message);

    // 5. Panggil API Gemini 3.6 Flash menggunakan standar struktur SDK @google/genai terbaru
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash", // Menggunakan model terbaru yang stabil, cepat, dan hemat token
      contents: formattedContents,
      config: {
        systemInstruction: systemInstruction, // Langsung masukkan string teks prompt Modi di sini
      },
    });

    let aiReply =
      response.text || "Maaf Kak, Modi agak linglung. Bisa diulang?";

    // 6. Cek apakah Modi ingin memperbarui memori jangka panjangnya
    const memoryMatch = aiReply.match(
      /<UPDATE_MEMORY>([\s\S]*?)<\/UPDATE_MEMORY>/,
    );
    if (memoryMatch && memoryMatch[1]) {
      const newMemoryNotes = memoryMatch[1].trim();
      // Gabungkan memori lama dengan temuan baru agar memorinya makin kaya
      const updatedNotes = `${longTermMemory}\n- ${newMemoryNotes}`.trim();
      await updateModiMemory(updatedNotes);

      // Bersihkan tag memori dari teks balasan agar tidak ikut terbaca oleh Kak Hendi / Kak Gita
      aiReply = aiReply
        .replace(/<UPDATE_MEMORY>([\s\S]*?)<\/UPDATE_MEMORY>/g, "")
        .trim();
    }

    // 7. Simpan balasan Modi ke database Supabase
    await saveChat(validUserName, "model", aiReply);

    // 8. Kirim balasan ke tampilan chat toko online Anda
    return NextResponse.json({ reply: aiReply });
  } catch (error: any) {
    console.error("Error pada Modi Chat API:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server." },
      { status: 500 },
    );
  }
}
