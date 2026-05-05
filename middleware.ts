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
  const { pathname } = request.nextUrl;
  const isPublicRoute = publicRoutes.has(pathname);

  if (pathname === "/") {
    return NextResponse.redirect(new URL(isLoggedIn ? "/dashboard" : "/auth/login", request.url));
  }

  if (!isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (isLoggedIn && (pathname === "/auth/login" || pathname === "/auth/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)).*)"
  ]
};
