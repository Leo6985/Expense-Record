import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

// Auth.js always stamps the session cookie with Expires (from session.maxAge), so it survives
// a browser restart. Strip Expires/Max-Age from it here so it becomes a browser-session cookie
// and users must log in again after closing the browser. The JWT inside still expires after
// session.maxAge, so a browser left open doesn't stay signed in forever. Deletions (sign-out
// sends Max-Age=0) are left untouched.
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?=/;

function toBrowserSessionCookies(res: Response): Response {
  const cookies = res.headers.getSetCookie();
  if (!cookies.some((c) => SESSION_COOKIE.test(c))) return res;

  const headers = new Headers(res.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies) {
    const isDeletion = /;\s*max-age=0(;|$)/i.test(cookie);
    headers.append(
      "set-cookie",
      SESSION_COOKIE.test(cookie) && !isDeletion
        ? cookie.replace(/;\s*(expires|max-age)=[^;]*/gi, "")
        : cookie
    );
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function GET(req: NextRequest) {
  return toBrowserSessionCookies(await handlers.GET(req));
}

export async function POST(req: NextRequest) {
  return toBrowserSessionCookies(await handlers.POST(req));
}
