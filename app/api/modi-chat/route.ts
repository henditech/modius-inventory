import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
Kamu adalah Modi, asisten AI cerdas, ramah, dan santai untuk sistem Modius Admin.
Pengguna sistem ini hanya ada dua orang, yaitu Hendi dan Gita.

Tugas kamu:
1. Membantu memberikan analisis strategi bisnis, perhitungan kesehatan iklan (CTR, Conversion Rate, CPA/ROAS), dan performa stok.
2. Menjawab obrolan dengan gaya kasual, suportif, jelas, dan profesional.
3. Jika diminta membuat laporan atau analisis, sajikan dengan format markdown yang rapi.
`;

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY belum terpasang di .env.local!");
      return NextResponse.json(
        { reply: "Error: API Key belum dipasang di .env.local" },
        { status: 500 },
      );
    }

    // Panggilan sederhana tanpa history dulu untuk tes koneksi
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    return NextResponse.json({ reply: response.text });
  } catch (error: any) {
    // Log error asli ke terminal VS Code kamu
    console.error("Gemini API Error Detail:", error);
    return NextResponse.json(
      { reply: `Gagal terhubung: ${error.message || "Unknown error"}` },
      { status: 500 },
    );
  }
}
