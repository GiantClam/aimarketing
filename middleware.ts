import { NextResponse, type NextRequest } from "next/server"

import { LOCALE_COOKIE_NAME, resolveRequestLocale } from "@/lib/i18n/config"
import {
  extractLocaleFromPathname,
  isLocalizedPublicPath,
  localizePublicPath,
  LOCALE_REQUEST_HEADER_NAME,
} from "@/lib/i18n/routing"

const PUBLIC_PATHS = new Set(["/login", "/register"])
const SESSION_COOKIE_NAME = "aimarketing_session"
const DEMO_SESSION_COOKIE_NAME = "aimarketing_demo_session"

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin")
  return response
}

function applyLocaleCookie(response: NextResponse, locale: string) {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { locale: pathLocale, pathname: normalizedPathname } = extractLocaleFromPathname(pathname)
  const locale = resolveRequestLocale(request.cookies.get(LOCALE_COOKIE_NAME)?.value, pathLocale)
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const demoSessionToken = request.cookies.get(DEMO_SESSION_COOKIE_NAME)?.value
  const hasUserSession = Boolean(sessionToken)
  const hasDemoSession = Boolean(demoSessionToken)
  const isAuthenticated = hasUserSession || hasDemoSession

  if (!pathLocale && isLocalizedPublicPath(normalizedPathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = localizePublicPath(normalizedPathname, locale)
    return applySecurityHeaders(applyLocaleCookie(NextResponse.redirect(redirectUrl), locale))
  }

  if (normalizedPathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", normalizedPathname)
      return applySecurityHeaders(applyLocaleCookie(NextResponse.redirect(loginUrl), locale))
    }
  }

  if (PUBLIC_PATHS.has(normalizedPathname) && hasUserSession) {
    return applySecurityHeaders(applyLocaleCookie(NextResponse.redirect(new URL("/dashboard", request.url)), locale))
  }

  if (pathLocale) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set(LOCALE_REQUEST_HEADER_NAME, locale)
    return applySecurityHeaders(
      applyLocaleCookie(
        NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        }),
        locale,
      ),
    )
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(LOCALE_REQUEST_HEADER_NAME, locale)
  return applySecurityHeaders(
    applyLocaleCookie(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      locale,
    ),
  )
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
