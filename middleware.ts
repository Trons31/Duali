import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const publicRoutes = new Set(["/", "/auth/login", "/auth/register"]);

export async function middleware(request: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET ?? "dev-secret-change-me";
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const secureCookie = authUrl
    ? authUrl.startsWith("https://")
    : request.nextUrl.protocol === "https:";

  const token =
    (await getToken({
      req: request,
      secret,
      secureCookie
    })) ??
    (await getToken({
      req: request,
      secret,
      secureCookie: !secureCookie
    }));

  const isLoggedIn = Boolean(token);
  const isAdmin = token?.role === "ADMIN" || token?.sub === "duali-admin";
  const { pathname } = request.nextUrl;
  const isPublicRoute = publicRoutes.has(pathname);

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.redirect(new URL(isAdmin ? "/admin" : "/auth/login", request.url));
    }

    if (!isAdmin) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(isAdmin ? "/admin" : isLoggedIn ? "/dashboard" : "/auth/login", request.url));
  }

  if (isAdmin && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (isLoggedIn && pathname === "/auth/login" && request.nextUrl.searchParams.get("session") === "expired") {
    return NextResponse.next();
  }

  if (isLoggedIn && (pathname === "/auth/login" || pathname === "/auth/register")) {
    return NextResponse.redirect(new URL(isAdmin ? "/admin" : "/dashboard", request.url));
  }

  return NextResponse.next();
}

// El service worker (/sw.js) pide su archivo constantemente: sin excluirlo,
// cada una de esas peticiones ejecutaba el middleware.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|_next/data|favicon.ico|manifest.webmanifest|sw.js|robots.txt|sitemap.xml|opengraph-image|twitter-image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf|js|map|txt|xml)).*)"
  ]
};
