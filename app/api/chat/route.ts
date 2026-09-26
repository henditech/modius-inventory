import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  SchemaType,
} from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// 1. Inisialisasi Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 2. Inisialisasi Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const getStockStatusTool: FunctionDeclaration = {
  name: "getStockStatus",
  description:
    "Mengambil status stok produk topi, bahan packing (supplies), atau pin logo.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      category: {
        type: SchemaType.STRING,
        description:
          'Kategori stok yang dicari: "product", "supplies", atau "pins"',
      },
    },
    required: ["category"],
  },
};

const searchSalesOrResiTool: FunctionDeclaration = {
  name: "searchSalesOrResi",
  description: "Mencari catatan penjualan atau informasi resi/AWB tertentu.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      keyword: {
        type: SchemaType.STRING,
        description: "Nomor resi, AWB, atau nama produk yang dicari.",
      },
    },
    required: ["keyword"],
  },
};

const getSalesOverviewTool: FunctionDeclaration = {
  name: "getSalesOverview",
  description: "Mengambil ringkasan dan tren penjualan beberapa hari terakhir.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      days: {
        type: SchemaType.NUMBER,
        description: "Jumlah hari ke belakang (default 7 hari)",
      },
    },
  },
};

// 4. Implementasi Eksekusi Query Supabase
async function executeTool(name: string, args: any) {
  if (name === "getStockStatus") {
    if (args.category === "supplies") {
      const { data } = await supabase
        .from("packing_supplies")
        .select("name, unit, current_qty");
      return data;
    } else if (args.category === "pins") {
      const { data } = await supabase
        .from("pin_stock")
        .select("logo_id, available_qty, logos(name)");
      return data;
    } else {
      const { data } = await supabase
        .from("products")
        .select("sku, name, available_qty")
        .limit(20);
      return data;
    }
  }

  if (name === "searchSalesOrResi") {
    const { data } = await supabase
      .from("sales")
      .select(
        "id, resi_number, awb_number, quantity, status, sold_at, products(name)",
      )
      .or(
        `resi_number.ilike.%${args.keyword}%,awb_number.ilike.%${args.keyword}%`,
      )
      .limit(10);
    return data;
  }

  if (name === "getSalesOverview") {
    const days = args.days || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data } = await supabase
      .from("sales")
      .select("quantity, sold_at, status")
      .gte("sold_at", startDate.toISOString());
    return data;
  }

  return { error: "Tool tidak ditemukan" };
}

// 5. POST Handler
export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools: [
        {
          functionDeclarations: [
            getStockStatusTool,
            searchSalesOrResiTool,
            getSalesOverviewTool,
          ],
        },
      ],
    });

    const chat = model.startChat({ history: history || [] });
    let result = await chat.sendMessage(message);
    let response = result.response;

    // Cek apakah Gemini ingin memanggil fungsi (Tool Call)
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const toolResult = await executeTool(call.name, call.args);

      // Kirim balik hasil query database ke Gemini untuk disusun jawaban akhirnya
      result = await chat.sendMessage([
        {
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
          },
        },
      ]);
      response = result.response;
    }

    return NextResponse.json({ text: response.text() });
  } catch (error: any) {
    console.error("Error in Chat API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
