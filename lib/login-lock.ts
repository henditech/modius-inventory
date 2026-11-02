// lib/login-lock.ts
// Aturan penguncian login (fungsi murni, mudah diuji).
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

// Sisa menit penguncian (dibulatkan ke atas). 0 = tidak terkunci.
export function lockRemainingMinutes(
  lockedUntil: string | null | undefined,
  now: number = Date.now(),
): number {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 60000);
}

// Keadaan baru setelah satu percobaan gagal.
// Begitu kena kunci, hitungan percobaan kembali ke 0 untuk putaran berikutnya.
export function nextFailureState(
  currentAttempts: number | null | undefined,
  now: number = Date.now(),
): { failed_attempts: number; locked_until: string | null; locked: boolean } {
  const attempts = (currentAttempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return {
      failed_attempts: 0,
      locked_until: new Date(now + LOCK_MINUTES * 60_000).toISOString(),
      locked: true,
    };
  }
  return { failed_attempts: attempts, locked_until: null, locked: false };
}
