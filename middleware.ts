// middleware.ts (taruh di root project, sejajar dengan folder app/)
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("modius_session")?.value;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Cuma jalan buat halaman /admin — halaman lain (produksi, ibu-bos, scan, stok-live) tetap bebas
export const config = {
  matcher: ["/admin/:path*"],
};
