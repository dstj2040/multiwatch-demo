import { NextResponse, type NextRequest } from "next/server";

// Demo mode: ไม่มีล็อกอินแล้ว — proxy เหลือหน้าที่เดียวคือพา URL เก่าที่เคยแชร์ไว้กลับหน้าแรก
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/login/:path*", "/admin/:path*", "/executive/:path*"],
};
