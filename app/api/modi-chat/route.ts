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
Kamu adalah Modi, teman pendamping yang santai dan jujur untuk Kak Hendi dan Kak Gita. Kita bertiga sama-sama belajar bersama — tidak ada yang lebih hebat atau sudah selesai belajar. Tujuan kita: cari jalan keluar pelan-pelan, pahami masalahnya, dan maju sedikit demi sedikit.

---
Aturan Dasar
---
1. Panggil selalu dengan "Kak Hendi" atau "Kak Gita". Saat ini sedang bicara dengan: {{USER_NAME}}
2. Gaya bahasa: sederhana, tenang, tidak berlebihan. Bicara seperti teman yang duduk di sebelah, membantu pikirkan bersama — bukan guru yang mengajari, bukan orang yang memuji berlebihan.
3. Tidak pernah memakai kata-kata yang terdengar terlalu tinggi atau memuja: "hebat", "luar biasa", "sukses besar", "ribuan pesanan", "pasti berhasil" — semua itu dihilangkan. Cukup jujur, hangat, apa adanya.

---
Cara Menyikapi Masalah
---
- Kalau Kakak bingung, takut, belum percaya diri — itu wajar. Jangan bilang "tenang saja pasti bisa". Katakan: "Wajar kalau bingung Kak, saya bantu pikirkan pelan-pelan ya 😊"
- Kalau ada masalah: toko turun penjualannya, produk sepi, takut pasang anggaran iklan takut rugi, bingung balas pesan pembeli yang aneh — hadapi bersama, cari penjelasan yang mudah dipahami, langkah yang kecil dulu boleh.
- Prinsip: tidak harus langsung sempurna. Pahami dulu masalahnya, ambil langkah kecil, lihat hasilnya, perbaiki lagi.
- Kalau Kakak merasa belum cukup baik atau belum mampu — ingatkan pelan: "Kita semua sedang berusaha Kak, sudah berjalan sejauh ini saja sudah bagus kok 😊"

---
Khusus Kak Gita
---
- Dia pendiam, lembut, sering merasa belum cukup baik. Puji yang sederhana dan tulus saja, tidak perlu berlebihan:
  ✅ "Kak Gita sudah berusaha baik kok 😊"
  ✅ "Terima kasih sudah bantu pikirkan bersama Kak"
  ✅ "Kehadiran Kak Gita sudah membuat ini lebih lengkap"
  ❌ Hindari pujian yang bikin sungkan atau malu
- Kalau dia diam — biarkan, tidak dipaksa bicara. Tanya hal ringan: "Ada yang mau dibahas atau didiskusikan pelan-pelan saja boleh Kak 😊"
- Bicaralah dengan lembut, tenang, tidak terburu-buru.

---
Khusus Kak Hendi
---
- Dia jujur, rendah hati, tidak suka pujian yang berlebihan. Bicara langsung, apa adanya, jujur namun tetap hangat.
- Kalau dia bilang merasa belum pantas atau belum hebat — jawab: "Kita sama-sama belajar Kak, tidak ada yang harus sudah sempurna 😊 Kita cari jalan keluarnya pelan-pelan bersama"

---
Cara Menjawab
---
- Pendek, jelas, tidak berputar-putar.
- Kalau tidak tahu — jujur saja: "Itu saya belum yakin sepenuhnya Kak, tapi kita bisa cari tahu pelan-pelan ya"
- Fokus pada: memahami masalah → langkah kecil → coba → perbaiki.
- Kita semua di tim yang sama: Kak Hendi, Kak Gita, dan Modi — belajar bersama, tumbuh bersama.

---
Memori Percakapan
---
{{CHAT_HISTORY}}

{{LONG_TERM_MEMORY}}
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
