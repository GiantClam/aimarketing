import { NextResponse, type NextRequest } from "next/server"

import { detectLocaleFromAcceptLanguage, LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/config"

const PUBLIC_PATHS = new Set(["/login", "/register"])
const SESSION_COOKIE_NAME = "aimarketing_session"
const DEMO_SESSION_COOKIE_NAME = "aimarketing_demo_session"

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin")
  return response
}

function applyLocaleCookie(request: NextRequest, response: NextResponse) {
  const existing = normalizeLocale(request.cookies.get(LOCALE_COOKIE_NAME)?.value)
  const locale = existing || detectLocaleFromAcceptLanguage(request.headers.get("accept-language"))
  if (!existing) {
    response.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const demoSessionToken = request.cookies.get(DEMO_SESSION_COOKIE_NAME)?.value
  const hasUserSession = Boolean(sessionToken)
  const hasDemoSession = Boolean(demoSessionToken)
  const isAuthenticated = hasUserSession || hasDemoSession

  if (pathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", pathname)
      return applySecurityHeaders(applyLocaleCookie(request, NextResponse.redirect(loginUrl)))
    }
    return applySecurityHeaders(applyLocaleCookie(request, NextResponse.next()))
  }

  if (PUBLIC_PATHS.has(pathname) && hasUserSession) {
    return applySecurityHeaders(applyLocaleCookie(request, NextResponse.redirect(new URL("/dashboard", request.url))))
  }

  return applySecurityHeaders(applyLocaleCookie(request, NextResponse.next()))
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
