export function getCurrentLocale(): string {
  if (typeof document !== "undefined") {
    // Check URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const urlLocale = urlParams.get("locale");
    if (urlLocale) {
      console.log("Found locale in URL:", urlLocale);
      return urlLocale;
    }

    // Check cookies
    const cookies = document.cookie.split(";");
    const localeCookie = cookies.find(cookie =>
      cookie.trim().startsWith("locale=")
    );
    if (localeCookie) {
      const localeValue = localeCookie.split("=")[1];
      console.log("Found locale cookie:", localeValue);
      return localeValue;
    }

    // Check localStorage as fallback
    const storedLocale = localStorage.getItem("locale");
    if (storedLocale) {
      console.log("Found locale in localStorage:", storedLocale);
      return storedLocale;
    }

    console.log("No locale found, available cookies:", document.cookie);
    console.log("Current URL:", window.location.href);
  }
  console.log("Document not available (SSR)");
  return "en"; // fallback to default
}

export function detectBrowserLocale(): string {
  if (typeof navigator !== "undefined") {
    return navigator.language.split("-")[0] || "en";
  }
  return "en";
}

export function setLocaleInStorage(locale: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("locale", locale);
  }
}

export function setLocaleCookie(locale: string, days: number = 365): void {
  if (typeof document !== "undefined") {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `locale=${locale};expires=${expires.toUTCString()};path=/`;
  }
}

export function validateLocale(locale: string): boolean {
  const supportedLocales = ["en", "es", "fr", "ja", "ko", "zh-TW", "zh"];
  return supportedLocales.includes(locale);
}

export function normalizeLocale(locale: string): string {
  const normalized = locale.toLowerCase();
  const localeMap: Record<string, string> = {
    "zh-cn": "zh",
    "zh-tw": "zh-TW",
    "zh-hk": "zh-TW"
  };

  return localeMap[normalized] || normalized;
}
