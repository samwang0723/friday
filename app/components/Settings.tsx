"use client";

import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import LanguageSwitcher from "./LanguageSwitcher";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  isAuthenticated: boolean;
  onSettingsChange: (settings: SettingsState) => void;
}

export interface SettingsState {
  sttEngine: string;
  ttsEngine: string;
  streaming: boolean;
}

export default function Settings({
  isOpen,
  onClose,
  onLogout,
  isAuthenticated,
  onSettingsChange
}: SettingsProps) {
  const t = useTranslations("settings");
  const locale = useLocale();

  // Check if current locale is English
  const isEnglishLocale = locale === "en";

  // Helper functions for localStorage persistence
  const loadSettingsFromStorage = (): SettingsState => {
    if (typeof window === "undefined") {
      // Server-side rendering fallback
      return {
        sttEngine: "groq",
        ttsEngine: "elevenlabs",
        streaming: true
      };
    }

    try {
      const savedSettings = localStorage.getItem("voiceAssistantSettings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        console.log("Loaded settings from localStorage:", parsed);
        return {
          sttEngine: parsed.sttEngine || "groq",
          ttsEngine: parsed.ttsEngine || "elevenlabs",
          streaming: parsed.streaming !== undefined ? parsed.streaming : true
        };
      }
    } catch (error) {
      console.error("Failed to load settings from localStorage:", error);
    }

    // Return defaults if no saved settings or error
    return {
      sttEngine: "groq",
      ttsEngine: "elevenlabs",
      streaming: true
    };
  };

  const saveSettingsToStorage = (newSettings: SettingsState) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "voiceAssistantSettings",
          JSON.stringify(newSettings)
        );
        console.log("Saved settings to localStorage:", newSettings);
      } catch (error) {
        console.error("Failed to save settings to localStorage:", error);
      }
    }
  };

  const [settings, setSettings] = useState<SettingsState>({
    sttEngine: "groq",
    ttsEngine: "elevenlabs",
    streaming: true
  });

  // Load settings from localStorage after component mounts
  useEffect(() => {
    const savedSettings = loadSettingsFromStorage();
    setSettings(savedSettings);
    // Call onSettingsChange with loaded settings
    onSettingsChange(savedSettings);
  }, []);

  const updateSetting = (key: string, value: any) => {
    const newSettings = {
      ...settings,
      [key]: value
    };
    setSettings(newSettings);
    saveSettingsToStorage(newSettings);
    onSettingsChange(newSettings);
  };

  // Force TTS engine to ElevenLabs for non-English locales
  useEffect(() => {
    if (!isEnglishLocale && settings.ttsEngine !== "elevenlabs") {
      console.log(`Forcing TTS engine to ElevenLabs for locale: ${locale}`);
      updateSetting("ttsEngine", "elevenlabs");
    }
  }, [locale, isEnglishLocale, settings.ttsEngine]);

  const handleLogout = () => {
    if (!isAuthenticated) return;
    onLogout();
    onClose(); // Close the settings panel after logout
  };

  return (
    <>
      {/* Settings Panel */}
      <div
        className={clsx(
          "fixed bottom-0 left-0 right-0 bg-neutral-900/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-t-2xl p-8 pb-10 pt-3 shadow-2xl max-h-[75vh] overflow-y-auto transition-transform duration-500 ease-out z-50",
          {
            "transform translate-y-full": !isOpen,
            "transform translate-y-0": isOpen
          }
        )}
      >
        <div className="w-full flex justify-center mb-4">
          <div className="w-10 h-1 bg-white/30 rounded-full"></div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-medium text-white">{t("title")}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close settings"
          >
            <svg
              className="h-6 w-6 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Speech-to-Text */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg
                className="h-5 w-5 text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              <div className="flex flex-col">
                <span className="text-white text-sm">{t("speechToText")}</span>
                <span className="text-gray-400 text-xs">
                  {t("speechToTextDescription")}
                </span>
              </div>
            </div>
            <select
              id="stt-engine"
              name="sttEngine"
              value={settings.sttEngine}
              onChange={e => updateSetting("sttEngine", e.target.value)}
              className="bg-white/10 text-white text-sm rounded-md px-3 py-1 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none bg-no-repeat bg-right pr-8"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundPosition: "right 0.5rem center",
                backgroundSize: "1.25em"
              }}
            >
              <option value="groq">Groq</option>
            </select>
          </div>

          {/* Text-to-Speech */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg
                className="h-5 w-5 text-purple-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9.464 15.536a5 5 0 01-7.072-7.072m9.9-2.828a9 9 0 00-12.728 0"
                />
              </svg>
              <div className="flex flex-col">
                <span className="text-white text-sm">{t("textToSpeech")}</span>
                <span className="text-gray-400 text-xs">
                  {isEnglishLocale
                    ? t("textToSpeechDescription")
                    : t("textToSpeechNonEnglish")}
                </span>
              </div>
            </div>
            <select
              id="tts-engine"
              name="ttsEngine"
              value={settings.ttsEngine}
              onChange={e => updateSetting("ttsEngine", e.target.value)}
              disabled={!isEnglishLocale}
              className={clsx(
                "bg-white/10 text-white text-sm rounded-md px-3 py-1 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none bg-no-repeat bg-right pr-8",
                {
                  "opacity-50 cursor-not-allowed": !isEnglishLocale
                }
              )}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundPosition: "right 0.5rem center",
                backgroundSize: "1.25em"
              }}
            >
              <option value="elevenlabs">ElevenLabs</option>
              <option value="cartesia" disabled={!isEnglishLocale}>
                Cartesia{!isEnglishLocale ? " (English)" : ""}
              </option>
            </select>
          </div>

          {/* Streaming Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg
                className="h-5 w-5 text-green-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <div className="flex flex-col">
                <span className="text-white text-sm">{t("streaming")}</span>
                <span className="text-gray-400 text-xs">
                  {t("streamingDescription")}
                </span>
              </div>
            </div>
            <button
              onClick={() => updateSetting("streaming", !settings.streaming)}
              className={clsx(
                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                {
                  "bg-blue-600": settings.streaming,
                  "bg-gray-600": !settings.streaming
                }
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  {
                    "translate-x-5": settings.streaming,
                    "translate-x-0": !settings.streaming
                  }
                )}
              />
            </button>
          </div>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Logout Button */}
          <div className="flex items-center justify-end pt-6">
            <button
              onClick={handleLogout}
              disabled={!isAuthenticated}
              className={clsx(
                "text-sm py-2 px-4 rounded-md transition-colors",
                {
                  "bg-red-600 hover:bg-red-700 text-white cursor-pointer":
                    isAuthenticated,
                  "bg-gray-600 text-gray-400 cursor-not-allowed":
                    !isAuthenticated
                }
              )}
            >
              {t("auth.signOut")}
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
    </>
  );
}
