// app/api/modi-chat/route.ts
import { GoogleGenAI } from "@google/genai";
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
Catatan Memori
---
Kalau ada hal penting dan tahan lama tentang Kak Hendi atau Kak Gita (kebiasaan, keputusan, hal yang mereka bilang perlu diingat), tulis di akhir balasan dengan format:
<UPDATE_MEMORY>Kak Nama: satu kalimat singkat</UPDATE_MEMORY>
Selalu awali dengan nama orangnya, misalnya "Kak Gita: lebih nyaman kalau ditanya pelan-pelan". Jangan catat obrolan biasa atau hal sesaat. Tag ini tidak akan terlihat oleh Kakak.
---
Memori Percakapan
---
{{LONG_TERM_MEMORY}}
`;

export const maxDuration = 30;

// Pastikan nama model ini valid di akunmu (cek di Google AI Studio).
// Error 404 (model tidak ada) tidak akan di-retry.
const MODELS = ["gemini-3.6-flash", "gemini-3.8-flash"];

const MEMORY_OPEN = "<UPDATE_MEMORY>";
const MEMORY_REGEX = /<UPDATE_MEMORY>([\s\S]*?)<\/UPDATE_MEMORY>/g;

async function generateStreamWithRetry(params: { contents: any; config: any }) {
  let lastErr: any;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContentStream({
          model,
          contents: params.contents,
          config: params.config,
        });
      } catch (err: any) {
        lastErr = err;
        const retryable = err?.status === 503 || err?.status === 429;
        if (!retryable) throw err;
        console.warn(`⚠️ ${model} sibuk (percobaan ${attempt + 1})`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
  }
  throw lastErr;
}

/**
 * Hitung sampai karakter ke berapa teks aman dikirim ke client.
 * - Kalau tag <UPDATE_MEMORY> sudah mulai -> berhenti tepat sebelum tag.
 * - Kalau ujung teks mirip awal tag (misal "<UPDA") -> tahan dulu,
 *   karena bisa jadi tag-nya terpotong di antara dua chunk.
 */
function getSafeEnd(text: string): number {
  const tagStart = text.indexOf(MEMORY_OPEN);
  if (tagStart !== -1) return tagStart;

  const maxHold = Math.min(MEMORY_OPEN.length - 1, text.length);
  for (let len = maxHold; len > 0; len--) {
    if (MEMORY_OPEN.startsWith(text.slice(-len))) {
      return text.length - len;
    }
  }
  return text.length;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt: string = body.prompt || body.message || body.text || "";
    const userName: string =
      body.userName || body.username || body.name || "Hendi";

    const validUserName = userName.toLowerCase().includes("gita")
      ? "Kak Gita"
      : "Kak Hendi";

    if (!prompt.trim()) {
      return new Response("Pesan tidak boleh kosong", { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return new Response("Error: API Key belum terpasang", { status: 500 });
    }

    const longTermMemory = await getModiMemory();
    const shortTermHistory = await getChatHistory(validUserName);

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
    contents.push({ role: "user", parts: [{ text: prompt }] });

    try {
      await saveChat(validUserName, "user", prompt);
    } catch (e) {
      console.error("Gagal simpan pesan user:", e);
      return new Response("Database sibuk sebentar 😊", { status: 500 });
    }

    const responseStream = await generateStreamWithRetry({
      contents,
      config: { systemInstruction, temperature: 0.7 },
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let completeReply = "";
        let sentLength = 0;

        try {
          // 1. Alirkan teks ke client (tanpa tag memori)
          for await (const chunk of responseStream) {
            if (!chunk.text) continue;
            completeReply += chunk.text;

            const safeEnd = getSafeEnd(completeReply);
            if (safeEnd > sentLength) {
              controller.enqueue(
                encoder.encode(completeReply.slice(sentLength, safeEnd)),
              );
              sentLength = safeEnd;
            }
          }

          // 2. Kirim sisa teks yang tadi ditahan (kalau bukan tag sungguhan)
          const finalClean = completeReply.replace(MEMORY_REGEX, "").trim();
          const hasOpenTag = completeReply.includes(MEMORY_OPEN);
          if (!hasOpenTag && completeReply.length > sentLength) {
            controller.enqueue(encoder.encode(completeReply.slice(sentLength)));
          }

          // 3. Simpan ke DB SEBELUM stream ditutup
          //    (di serverless, kerjaan setelah close bisa terpotong)
          try {
            const memoryMatch = [...completeReply.matchAll(MEMORY_REGEX)][0];
            if (memoryMatch?.[1]) {
              const newNotes = memoryMatch[1].trim();
              const updatedNotes = longTermMemory
                ? `${longTermMemory}\n- ${newNotes}`.trim()
                : `- ${newNotes}`;
              await updateModiMemory(updatedNotes);
            }
            if (finalClean) {
              await saveChat(validUserName, "model", finalClean);
            }
          } catch (dbErr) {
            console.error("❌ Gagal simpan data pasca-stream:", dbErr);
          }

          controller.close();
        } catch (err) {
          console.error("❌ Error saat streaming:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    console.error("❌ Error utama:", err);
    return new Response("Modi lagi ramai banget Kak, coba lagi ya 😊", {
      status: 500,
    });
  }
}
