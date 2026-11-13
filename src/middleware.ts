import { NextResponse, type NextRequest } from "next/server";

/**
 * Operator console gate (Basic auth: any user / ADMIN_API_KEY).
 * Replace with real auth (SSO / magic link + roles) before onboarding external merchants.
 */
export function middleware(req: NextRequest) {
  const expected = process.env.ADMIN_API_KEY;
  const h = req.headers.get("authorization") ?? "";
  const pass = h.startsWith("Basic ") ? atob(h.slice(6)).split(":").slice(1).join(":") : "";
  if (expected && expected !== "change-me" && pass === expected) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="console"' } });
}

export const config = { matcher: ["/dashboard/:path*"] };
