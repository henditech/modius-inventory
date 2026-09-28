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
---
Catatan Memori
---
Kalau ada hal penting dan tahan lama tentang Kak Hendi atau Kak Gita (kebiasaan, keputusan, hal yang mereka bilang perlu diingat), tulis di akhir balasan dengan format:
<UPDATE_MEMORY>satu kalimat singkat</UPDATE_MEMORY>
Jangan catat obrolan biasa atau hal sesaat. Tag ini tidak akan terlihat oleh Kakak.
Memori Percakapan
---
{{LONG_TERM_MEMORY}}
`;

export const maxDuration = 30; // biar tidak kena timeout Vercel saat retry

const MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash", // model cadangan, isi dengan yang tersedia di akunmu
];

async function generateWithRetry(params: { contents: any; config: any }) {
  let lastErr: any;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContent({ model, ...params });
      } catch (err: any) {
        lastErr = err;
        const retryable = err?.status === 503 || err?.status === 429;
        if (!retryable) throw err;
        console.warn(`⚠️ ${model} sibuk (percobaan ${attempt + 1})`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); // 1s, 2s
        }
      }
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = body.prompt || body.message || body.text || "";
    const userName = body.userName || body.username || body.name || "Hendi";

    const validUserName = userName.toLowerCase().includes("gita")
      ? "Kak Gita"
      : "Kak Hendi";

    if (!prompt || prompt.trim() === "") {
      return NextResponse.json(
        { reply: "Pesan tidak boleh kosong" },
        { status: 400 },
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY belum terpasang!");
      return NextResponse.json(
        { reply: "Error: API Key belum terpasang" },
        { status: 500 },
      );
    }

    const longTermMemory = await getModiMemory();
    const shortTermHistory = await getChatHistory();

    const systemInstruction = SYSTEM_INSTRUCTION_BASE.replace(
      "{{USER_NAME}}",
      validUserName,
    ).replace(
      "{{LONG_TERM_MEMORY}}",
      longTermMemory || "Belum ada catatan khusus.",
    );

    const contents = shortTermHistory.map((chat) => ({
      role: chat.role,
      parts: [{ text: chat.content }],
    }));
    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    try {
      await saveChat(validUserName, "user", prompt);
    } catch (e) {
      console.error("Gagal simpan user:", e);
      return NextResponse.json(
        { reply: "Database sibuk sebentar 😊 Coba kirim lagi ya" },
        { status: 500 },
      );
    }

    console.log("📤 Mengirim ke Gemini...");

    // === Panggil Gemini ===
    const result = await generateWithRetry({
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    // === Baca respons dengan AMAN ===
    let aiReply = "Maaf Kak, Modi agak linglung sebentar 😊 Bisa diulang?";

    // === Baca respons dengan AMAN — sesuai SDK @google/genai ===
    try {
      // SDK @google/genai langsung kasih datanya, TIDAK pakai .response lagi!
      const candidate = result.candidates?.[0]; // ❌ hapus .response di sini!
      const text = candidate?.content?.parts?.map((p: any) => p.text).join("");

      if (text && text.trim()) {
        aiReply = text;
      } else {
        console.warn("⚠️ Isi respons kosong:", JSON.stringify(result, null, 2));
      }
    } catch (parseErr) {
      console.error("❌ Gagal baca isi respons:", parseErr);
    }

    // === Cek memori ===
    const memoryMatch = aiReply.match(
      /<UPDATE_MEMORY>([\s\S]*?)<\/UPDATE_MEMORY>/,
    );
    if (memoryMatch?.[1]) {
      const newNotes = memoryMatch[1].trim();
      const updatedNotes = longTermMemory
        ? `${longTermMemory}\n- ${newNotes}`.trim()
        : `- ${newNotes}`;
      await updateModiMemory(updatedNotes);
      aiReply = aiReply
        .replace(/<UPDATE_MEMORY>[\s\S]*?<\/UPDATE_MEMORY>/g, "")
        .trim();
    }

    try {
      await saveChat(validUserName, "model", aiReply);
    } catch (e) {
      console.error("Gagal simpan balasan:", e);
    }

    console.log("✅ Berhasil balas:", aiReply.slice(0, 50) + "...");

    return NextResponse.json({ reply: aiReply });
  } catch (err: any) {
    console.error("❌ Error utama:", err);
    const status = err?.status === 503 || err?.status === 429 ? 503 : 500;
    return NextResponse.json(
      { reply: "Modi lagi ramai banget Kak, coba kirim lagi sebentar ya 😊" },
      { status },
    );
  }
}
