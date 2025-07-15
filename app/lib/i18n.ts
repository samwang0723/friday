import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { locales, defaultLocale, type Locale } from "./i18n-client";

// Re-export for backward compatibility
export { locales, defaultLocale, localeLabels } from "./i18n-client";
export type { Locale } from "./i18n-client";

// Get locale from various sources
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("locale")?.value as Locale;

  // Check if the locale from cookie is valid
  if (localeCookie && locales.includes(localeCookie)) {
    return localeCookie;
  }

  return defaultLocale;
}

// Configuration for next-intl
export default getRequestConfig(async () => {
  const locale = await getLocale();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
