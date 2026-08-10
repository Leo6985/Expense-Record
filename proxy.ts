import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PURCHASING_PATHS = ["/purchase-orders", "/goods-receipts", "/products"];
const OWNER_ONLY_PATHS = ["/users"];

// /api/export/<module> should be gated by the same rule as its /<module> page.
function toPageEquivalent(pathname: string): string {
  if (pathname.startsWith("/api/export/")) return "/" + pathname.slice("/api/export/".length);
  return pathname;
}

function canAccess(pathname: string, role: string | undefined): boolean {
  if (!role) return false;
  if (role === "OWNER") return true;

  // Dashboard and vendor list → all roles
  if (pathname === "/" || pathname.startsWith("/vendors")) return true;

  if (role === "PURCHASING") {
    return PURCHASING_PATHS.some((p) => pathname.startsWith(p));
  }

  // Accounting gets every menu except owner-only ones (e.g. user management).
  if (role === "ACCOUNTING") {
    return !OWNER_ONLY_PATHS.some((p) => pathname.startsWith(p));
  }

  return false;
}

export async function proxy(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  // Skip auth routes
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  // Not logged in → redirect to login
  if (!session) {
    if (pathname === "/login") return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Already logged in → redirect away from login
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Check role-based access
  const role = (session.user as { role?: string })?.role;
  if (!canAccess(toPageEquivalent(pathname), role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
