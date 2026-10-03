// Barcode SPX baru berakhiran huruf (SPXID06503790480A). Baris yang tercatat
// sebelum perbaikan ekstensi menyimpan nomor tanpa huruf terakhir itu, jadi
// scanner mencoba kedua bentuknya.
export function awbOrFilter(code: string) {
  const safe = code.replace(/[,()]/g, "");
  const list = [safe];
  if (/^SPXID\d+[A-Z]$/i.test(safe)) list.push(safe.slice(0, -1));
  return list
    .flatMap((c) => [`awb_number.eq.${c}`, `resi_number.eq.${c}`])
    .join(",");
}

// Untuk kolom cari: buang huruf terakhir supaya cocok dengan baris lama
// (terpotong) maupun baru (lengkap).
export function trimAwbSuffix(q: string) {
  return /^SPXID\d+[A-Z]$/i.test(q) ? q.slice(0, -1) : q;
}
