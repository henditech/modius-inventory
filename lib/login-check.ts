// lib/login-check.ts
// Pemeriksaan password admin + penguncian, dipakai bersama oleh /api/login dan
// /api/login/change supaya aturan penguncian tidak bisa berbeda di dua tempat.
// db dan compare dikirim dari route (supabaseAdmin dan bcrypt) agar mudah diuji.
import {
  lockRemainingMinutes,
  nextFailureState,
  LOCK_MINUTES,
} from "./login-lock";

type Db = { from: (table: string) => any };
type Compare = (plain: string, hash: string) => Promise<boolean>;

export type PasswordCheck =
  | { status: "ok"; hint: string | null }
  | { status: "locked"; minutes: number }
  | { status: "wrong" }
  | { status: "no_password" }
  | { status: "error" };

export async function verifyAdminPassword(
  db: Db,
  compare: Compare,
  key: string,
  password: string,
): Promise<PasswordCheck> {
  const { data, error } = await db
    .from("admin_users")
    .select("password_hash, hint, failed_attempts, locked_until")
    .eq("name", key)
    .maybeSingle();

  // Gagal memeriksa akun (mis. kolom penguncian belum dibuat): jangan lolos.
  if (error) return { status: "error" };
  if (!data?.password_hash) return { status: "no_password" };

  // Sedang terkunci: tolak tanpa memeriksa password.
  const wait = lockRemainingMinutes(data.locked_until);
  if (wait > 0) return { status: "locked", minutes: wait };

  const valid = await compare(password, data.password_hash);

  if (!valid) {
    const state = nextFailureState(data.failed_attempts);
    await db
      .from("admin_users")
      .update({
        failed_attempts: state.failed_attempts,
        locked_until: state.locked_until,
      })
      .eq("name", key);
    return state.locked
      ? { status: "locked", minutes: LOCK_MINUTES }
      : { status: "wrong" };
  }

  // Berhasil: bersihkan hitungan gagal.
  if ((data.failed_attempts ?? 0) > 0 || data.locked_until) {
    await db
      .from("admin_users")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("name", key);
  }
  return { status: "ok", hint: data.hint ?? null };
}
