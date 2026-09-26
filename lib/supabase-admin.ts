// lib/supabase-admin.ts
// PENTING: file ini hanya boleh dipakai di server (route.ts / API route),
// jangan pernah di-import dari komponen "use client".
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
