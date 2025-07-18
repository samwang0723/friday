"use client";

import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import LanguageSwitcher from "./LanguageSwitcher";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  isAuthenticated: boolean;
  settings: {
    sttEngine: string;
    ttsEngine: string;
    streaming: boolean;
    audioEnabled: boolean;
  };
  settingsLoaded: boolean;
  onSettingsChange: (settings: SettingsProps["settings"]) => void;
}

export default function Settings({
  isOpen,
  onClose,
  onLogout,
  isAuthenticated,
  settings,
  settingsLoaded,
  onSettingsChange
}: SettingsProps) {
  const t = useTranslations("settings");
  const locale = useLocale();

  // Check if current locale is English
  const isEnglishLocale = locale === "en";
  // Check if current locale is Chinese (Traditional or Simplified)
  const isChineseLocale =
    locale === "zh" || locale === "zh-TW" || locale === "zh-CN";

  const updateSetting = (key: string, value: unknown) => {
    const newSettings = {
      ...settings,
      [key]: value
    };
    onSettingsChange(newSettings);
  };

  // Handle TTS engine selection based on locale - only for first-time users
  useEffect(() => {
    // Only apply locale-based defaults if settings have been loaded
    // and this is the first time (no saved settings existed)
    if (!settingsLoaded) return;

    // Check if this is a fresh installation (using default settings)
    const isDefaultSettings =
      settings.sttEngine === "groq" &&
      settings.ttsEngine === "elevenlabs" &&
      settings.streaming === true &&
      settings.audioEnabled === true;

    // Only apply locale-based defaults for fresh installations
    if (isDefaultSettings) {
      if (isChineseLocale && settings.ttsEngine !== "minimax") {
        console.log(
          "Setting TTS engine to Minimax for Chinese locale (first-time user):",
          locale
        );
        updateSetting("ttsEngine", "minimax");
      } else if (
        !isEnglishLocale &&
        !isChineseLocale &&
        settings.ttsEngine !== "elevenlabs"
      ) {
        console.log(
          "Setting TTS engine to ElevenLabs for locale (first-time user):",
          locale
        );
        updateSetting("ttsEngine", "elevenlabs");
      }
    }
  }, [
    locale,
    isEnglishLocale,
    isChineseLocale,
    settings.ttsEngine,
    settingsLoaded
  ]);

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
                    : isChineseLocale
                      ? t("textToSpeechChineseOnly")
                      : t("textToSpeechNonEnglish")}
                </span>
              </div>
            </div>
            <select
              id="tts-engine"
              name="ttsEngine"
              value={settings.ttsEngine}
              onChange={e => updateSetting("ttsEngine", e.target.value)}
              disabled={!isEnglishLocale && !isChineseLocale}
              className={clsx(
                "bg-white/10 text-white text-sm rounded-md px-3 py-1 border-none focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none bg-no-repeat bg-right pr-8",
                {
                  "opacity-50 cursor-not-allowed":
                    !isEnglishLocale && !isChineseLocale
                }
              )}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundPosition: "right 0.5rem center",
                backgroundSize: "1.25em"
              }}
            >
              {!isChineseLocale && (
                <option value="elevenlabs">ElevenLabs</option>
              )}
              {isEnglishLocale && <option value="cartesia">Cartesia</option>}
              {isChineseLocale && <option value="minimax">Minimax</option>}
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

          {/* Audio Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg
                className="h-5 w-5 text-orange-400"
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
                <span className="text-white text-sm">{t("audioEnabled")}</span>
                <span className="text-gray-400 text-xs">
                  {t("audioEnabledDescription")}
                </span>
              </div>
            </div>
            <button
              onClick={() =>
                updateSetting("audioEnabled", !settings.audioEnabled)
              }
              className={clsx(
                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                {
                  "bg-blue-600": settings.audioEnabled,
                  "bg-gray-600": !settings.audioEnabled
                }
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  {
                    "translate-x-5": settings.audioEnabled,
                    "translate-x-0": !settings.audioEnabled
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
