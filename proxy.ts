import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PURCHASING_PATHS = ["/purchase-orders", "/goods-receipts", "/products"];
const ACCOUNTING_PATHS = ["/accounts-payable", "/payment-prep", "/payments", "/company-accounts", "/reports", "/products", "/chart-of-accounts"];
const OWNER_ONLY_PATHS = ["/users"];
const ALL_PATHS = ["/", "/vendors"];

function canAccess(pathname: string, role: string | undefined): boolean {
  if (!role) return false;
  if (role === "OWNER") return true;

  // Dashboard and vendor list → all roles
  if (pathname === "/" || pathname.startsWith("/vendors")) return true;

  if (role === "PURCHASING") {
    return PURCHASING_PATHS.some((p) => pathname.startsWith(p));
  }

  if (role === "ACCOUNTING") {
    return ACCOUNTING_PATHS.some((p) => pathname.startsWith(p));
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
  if (!canAccess(pathname, role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
