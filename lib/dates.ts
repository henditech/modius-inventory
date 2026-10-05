// Tanggal "hari ini" menurut WIB, bukan UTC -- supaya jam 00.00-07.00 pagi
// tidak masih terbaca sebagai kemarin.
export function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// Geser tanggal (format YYYY-MM-DD) murni hitungan kalender, tidak
// terpengaruh zona waktu browser.
export function shiftDateStr(dateStr: string, deltaDays: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().split("T")[0];
}

// Awal hari (00.00 WIB) dari tanggal YYYY-MM-DD, dalam format ISO/UTC
// yang dipakai untuk membandingkan kolom timestamp di Supabase.
export function wibStartISO(dateStr: string) {
  return new Date(`${dateStr}T00:00:00+07:00`).toISOString();
}
