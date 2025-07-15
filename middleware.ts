import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "./app/lib/i18n-client";

export function middleware(request: NextRequest) {
  // Get locale from cookie or Accept-Language header
  const locale = getLocale(request) || defaultLocale;

  // Store locale in a cookie for persistence
  const response = NextResponse.next();
  response.cookies.set("locale", locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60 // 1 year
  });

  return response;
}

function getLocale(request: NextRequest): string | null {
  // 1. Check URL parameter (?locale=en)
  const urlLocale = request.nextUrl.searchParams.get("locale");
  if (urlLocale && locales.includes(urlLocale as any)) {
    return urlLocale;
  }

  // 2. Check existing cookie
  const cookieLocale = request.cookies.get("locale")?.value;
  if (cookieLocale && locales.includes(cookieLocale as any)) {
    return cookieLocale;
  }

  // 3. Check Accept-Language header
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const preferredLanguages = acceptLanguage.split(",").map((lang) => {
      const [code] = lang.trim().split(";");
      return code.toLowerCase();
    });

    for (const lang of preferredLanguages) {
      // Direct match (e.g., 'en')
      if (locales.includes(lang as any)) {
        return lang;
      }

      // Language code only (e.g., 'zh' from 'zh-CN')
      const langCode = lang.split("-")[0];
      if (locales.includes(langCode as any)) {
        return langCode;
      }
    }
  }

  return null;
}

// Configure which routes should be processed by this middleware
export const config = {
  matcher: [
    // Skip internal Next.js paths
    "/((?!_next|api|favicon.ico|.*\\.).*)"
  ]
};
