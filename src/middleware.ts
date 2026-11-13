import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge gate: no session cookie → /login. Full session validation (expiry, disabled user,
 * role) happens server-side in requireUser(); this only avoids rendering for anonymous traffic.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("bci_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
