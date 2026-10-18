import { NextResponse, type NextRequest } from "next/server";

/** Release manifest, not authentication. APIs and CoreWorkspace verify the session. */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const allowed = path === "/" || path === "/customers" || path === "/sign-in" || path === "/account" ||
    path === "/brand/obizee-mark.svg" || path === "/favicon.ico" ||
    path.startsWith("/_next/static/") || path === "/_next/image" ||
    path.startsWith("/api/") || path.startsWith("/auth/");
  if (allowed) return NextResponse.next();
  const response = NextResponse.redirect(new URL("/", request.url));
  response.headers.set("cache-control", "no-store");
  return response;
}
