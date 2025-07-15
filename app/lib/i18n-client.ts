// Client-side i18n utilities (safe for client components)

// Define supported locales
export const locales = ["en", "zh", "zh-TW", "ja", "ko", "es", "fr"] as const;
export type Locale = (typeof locales)[number];

// Default locale
export const defaultLocale: Locale = "en";

// Locale labels for UI
export const localeLabels: Record<Locale, string> = {
  en: "English",
  zh: "中文 (简体)",
  "zh-TW": "中文 (繁體)",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français"
};
