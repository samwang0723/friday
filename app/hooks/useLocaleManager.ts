import { useState, useEffect, useCallback, useMemo } from "react";
import type { LocaleManagerHookReturn } from "@/types/voiceChat";
import {
  getCurrentLocale,
  detectBrowserLocale,
  setLocaleInStorage,
  setLocaleCookie,
  validateLocale,
  normalizeLocale
} from "@/utils/localeUtils";

export function useLocaleManager(): LocaleManagerHookReturn {
  const [clientLocale, setClientLocale] = useState<string>("en");
  const [isLocaleInitialized, setIsLocaleInitialized] =
    useState<boolean>(false);

  // Initialize locale from client-side sources
  useEffect(() => {
    const initializeLocale = () => {
      try {
        const currentLocale = getCurrentLocale();
        const normalizedLocale = normalizeLocale(currentLocale);

        if (validateLocale(normalizedLocale)) {
          setClientLocale(normalizedLocale);
        } else {
          // Fallback to browser locale or default
          const browserLocale = detectBrowserLocale();
          const fallbackLocale = validateLocale(browserLocale)
            ? browserLocale
            : "en";
          setClientLocale(fallbackLocale);

          // Store the fallback locale
          setLocaleInStorage(fallbackLocale);
          setLocaleCookie(fallbackLocale);
        }

        setIsLocaleInitialized(true);
      } catch (error) {
        console.error("Error initializing locale:", error);
        setClientLocale("en");
        setIsLocaleInitialized(true);
      }
    };

    // Only run on client-side
    if (typeof window !== "undefined") {
      initializeLocale();
    }
  }, []);

  // Memoized function to get current locale
  const getCurrentLocaleValue = useCallback((): string => {
    if (!isLocaleInitialized) {
      return "en"; // Return default while initializing
    }
    return clientLocale;
  }, [clientLocale, isLocaleInitialized]);

  // Function to update locale
  const updateLocale = useCallback(
    (newLocale: string) => {
      const normalizedLocale = normalizeLocale(newLocale);

      if (!validateLocale(normalizedLocale)) {
        console.warn(
          `Invalid locale: ${newLocale}. Using current locale: ${clientLocale}`
        );
        return;
      }

      setClientLocale(normalizedLocale);
      setLocaleInStorage(normalizedLocale);
      setLocaleCookie(normalizedLocale);
    },
    [clientLocale]
  );

  // Memoize return object to prevent unnecessary re-renders
  // Only include stable values in dependencies
  return useMemo(
    () => ({
      clientLocale,
      getCurrentLocale: getCurrentLocaleValue,
      isLocaleInitialized
    }),
    [clientLocale, isLocaleInitialized]
    // getCurrentLocaleValue is stable based on its dependencies
  );
}
