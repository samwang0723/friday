"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { locales, localeLabels, type Locale } from "../lib/i18n-client";

interface LanguageSwitcherProps {
  className?: string;
}

export default function LanguageSwitcher({
  className = ""
}: LanguageSwitcherProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("settings");
  const [isPending, startTransition] = useTransition();

  const changeLanguage = (newLocale: Locale) => {
    if (newLocale === locale) return;

    startTransition(() => {
      // Set locale cookie via URL parameter
      const url = new URL(window.location.href);
      url.searchParams.set("locale", newLocale);

      // Navigate to current page with new locale parameter
      router.push(url.pathname + url.search);

      // Refresh to apply new locale
      setTimeout(() => {
        window.location.reload();
      }, 100);
    });
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center space-x-3">
        <svg
          className="h-5 w-5 text-cyan-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
          />
        </svg>
        <div className="flex flex-col">
          <span className="text-white text-sm">{t("language")}</span>
          <span className="text-gray-400 text-xs">
            {t("languageDescription")}
          </span>
        </div>
      </div>
      <select
        value={locale}
        onChange={(e) => changeLanguage(e.target.value as Locale)}
        disabled={isPending}
        className="bg-white/10 text-white text-sm rounded-md px-3 py-1 border-none focus:ring-2 focus:ring-cyan-500 focus:outline-none appearance-none bg-no-repeat bg-right pr-8"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundPosition: "right 0.5rem center",
          backgroundSize: "1.25em"
        }}
      >
        {locales.map((localeOption) => (
          <option key={localeOption} value={localeOption}>
            {localeLabels[localeOption]}
          </option>
        ))}
      </select>
    </div>
  );
}
