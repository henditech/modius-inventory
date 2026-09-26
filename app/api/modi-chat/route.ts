import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  getChatHistory,
  saveChat,
  getModiMemory,
  updateModiMemory,
} from "@/lib/supabase-admin";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION_BASE = `
Kamu adalah Modi, asisten AI cerdas, ramah, dan santai untuk sistem Modius. Pengguna sistem ini HANYA ada dua orang, yaitu Kak Hendi dan Kak Gita.
Aturan Panggilan & Bahasa:
1. Panggil pengguna HANYA dengan sebutan "Kak Hendi" atau "Kak Gita". Saat ini kamu sedang berbicara dengan: {{USER_NAME}}.
2. Gunakan gaya bahasa santai, hangat, dan akrab layaknya rekan kerja dekat yang suportif, namun TETAP sopan.
3. JANGAN PERNAH menggunakan kata gaul Jakarta seperti "lo", "gue", "lu", atau sejenisnya karena tidak sesuai dengan budaya kerja mereka.
Konteks Utama:
Kak Hendi dan Kak Gita adalah admin toko online yang mengelola marketplace Shopee, dan TikTok Shop.
Tugas dan Kepribadian Kamu:
1. Analisis Bisnis E-Commerce: Membantu memberikan analisis strategi toko, perhitungan kesehatan iklan (CTR, Conversion Rate, CPA/ROAS), serta performa stok secara tajam dan solutif.
2. Mode Teman Obrol: Jika mereka sedang gabut, jadilah teman mengobrol yang asyik, peka, dan menghibur tanpa kehilangan sisi profesional sebagai asisten.
3. Format Output: Jika diminta membuat laporan atau analisis, sajikan dengan format markdown yang rapi.
Catatan Memori Kamu:
"{{LONG_TERM_MEMORY}}"
Evolusi Persona:
Selalulah mengamati, beradaptasi, dan belajar dari percakapan. Di akhir jawaban, jika ada hal penting baru, tuliskan di tag <UPDATE_MEMORY>isi rangkuman</UPDATE_MEMORY>.
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = body.prompt || body.message || body.text || "";
    const userName = body.userName || body.username || body.name || "Hendi";

    // Validasi nama pengguna
    const validUserName = userName.toLowerCase().includes("gita")
      ? "Kak Gita"
      : "Kak Hendi";

    // Validasi pesan kosong
    if (!prompt || prompt.trim() === "") {
      return NextResponse.json(
        { reply: "Pesan tidak boleh kosong" },
        { status: 400 },
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY belum terpasang di .env.local!");
      return NextResponse.json(
        { reply: "Error: API Key belum dipasang di .env.local" },
        { status: 500 },
      );
    }

    // === Ambil riwayat & memori dari Supabase ===
    const longTermMemory = await getModiMemory();
    const shortTermHistory = await getChatHistory();

    // Susun instruksi lengkap
    const systemInstruction = SYSTEM_INSTRUCTION_BASE.replace(
      "{{USER_NAME}}",
      validUserName,
    ).replace(
      "{{LONG_TERM_MEMORY}}",
      longTermMemory || "Belum ada catatan khusus.",
    );

    // Format riwayat chat + pesan terbaru
    const contents = shortTermHistory.map((chat) => ({
      role: chat.role,
      parts: [{ text: chat.content }],
    }));
    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    // Simpan pesan user ke database
    await saveChat(validUserName, "user", prompt);

    // Panggil API — pakai model yang SUDAH JALAN di sistem kamu
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash", // ✅ Tetap pakai ini, sudah terbukti berfungsi!
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    let aiReply =
      response.text || "Maaf Kak, Modi agak linglung. Bisa diulang?";

    // Cek & simpan memori baru
    const memoryMatch = aiReply.match(
      /<UPDATE_MEMORY>([\s\S]*?)<\/UPDATE_MEMORY>/,
    );
    if (memoryMatch && memoryMatch[1]) {
      const newNotes = memoryMatch[1].trim();
      const updatedNotes = `${longTermMemory}\n- ${newNotes}`.trim();
      await updateModiMemory(updatedNotes);
      aiReply = aiReply
        .replace(/<UPDATE_MEMORY>[\s\S]*?<\/UPDATE_MEMORY>/g, "")
        .trim();
    }

    // Simpan jawaban AI ke database
    await saveChat(validUserName, "model", aiReply);

    return NextResponse.json({ reply: aiReply });
  } catch (error: any) {
    console.error("Gemini API Error Detail:", error);
    return NextResponse.json(
      { reply: `Gagal terhubung: ${error.message || "Unknown error"}` },
      { status: 500 },
    );
  }
}
