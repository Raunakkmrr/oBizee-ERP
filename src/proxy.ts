import { NextResponse, type NextRequest } from "next/server";

/** Release boundary, not authentication: unreviewed business pages stay unreachable. */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const allowed = path === "/sign-in" || path === "/account" ||
    path === "/brand/obizee-mark.svg" || path === "/favicon.ico" ||
    path.startsWith("/_next/static/") || path === "/_next/image" ||
    path.startsWith("/api/") || path.startsWith("/auth/");
  if (allowed) return NextResponse.next();
  const response = NextResponse.redirect(new URL("/account", request.url));
  response.headers.set("cache-control", "no-store");
  return response;
}
