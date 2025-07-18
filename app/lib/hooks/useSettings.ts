"use client";

import { useEffect, useState } from "react";

export interface SettingsState {
  sttEngine: string;
  ttsEngine: string;
  streaming: boolean;
  audioEnabled: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  sttEngine: "groq",
  ttsEngine: "elevenlabs",
  streaming: true,
  audioEnabled: true
};

const STORAGE_KEY = "voiceAssistantSettings";

/**
 * Custom hook for managing settings with localStorage persistence
 */
export function useSettings() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const loadSettings = () => {
      if (typeof window === "undefined") {
        return DEFAULT_SETTINGS;
      }

      try {
        const savedSettings = localStorage.getItem(STORAGE_KEY);
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          console.log("Loaded settings from localStorage:", parsed);

          const loadedSettings: SettingsState = {
            sttEngine: parsed.sttEngine || DEFAULT_SETTINGS.sttEngine,
            ttsEngine: parsed.ttsEngine || DEFAULT_SETTINGS.ttsEngine,
            streaming:
              parsed.streaming !== undefined
                ? parsed.streaming
                : DEFAULT_SETTINGS.streaming,
            audioEnabled:
              parsed.audioEnabled !== undefined
                ? parsed.audioEnabled
                : DEFAULT_SETTINGS.audioEnabled
          };

          return loadedSettings;
        }
      } catch (error) {
        console.error("Failed to load settings from localStorage:", error);
      }

      return DEFAULT_SETTINGS;
    };

    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage whenever they change
  const updateSettings = (newSettings: Partial<SettingsState>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSettings));
        console.log("Saved settings to localStorage:", updatedSettings);
      } catch (error) {
        console.error("Failed to save settings to localStorage:", error);
      }
    }
  };

  // Update individual setting
  const updateSetting = (key: keyof SettingsState, value: unknown) => {
    updateSettings({ [key]: value } as Partial<SettingsState>);
  };

  return {
    settings,
    updateSettings,
    updateSetting,
    isLoaded
  };
}
