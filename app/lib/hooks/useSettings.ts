"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface SettingsState {
  sttEngine: string;
  ttsEngine: string;
  streaming: boolean;
  audioEnabled: boolean;
  vadSensitivity: "low" | "medium" | "high";
}

const DEFAULT_SETTINGS: SettingsState = {
  sttEngine: "groq",
  ttsEngine: "elevenlabs",
  streaming: true,
  audioEnabled: true,
  vadSensitivity: "medium"
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
                : DEFAULT_SETTINGS.audioEnabled,
            vadSensitivity:
              parsed.vadSensitivity || DEFAULT_SETTINGS.vadSensitivity
          };

          return loadedSettings;
        }
      } catch (error) {
        console.error("Failed to load settings from localStorage:", error);
      }

      console.log("No saved settings found, using defaults");
      return DEFAULT_SETTINGS;
    };

    const loadedSettings = loadSettings();
    setSettings(loadedSettings);
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage whenever they change
  const updateSettings = useCallback((newSettings: Partial<SettingsState>) => {
    setSettings(prevSettings => {
      const updatedSettings = { ...prevSettings, ...newSettings };

      // Use requestAnimationFrame to avoid synchronous updates during render
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSettings));
            console.log("Saved settings to localStorage:", updatedSettings);
          } catch (error) {
            console.error("Failed to save settings to localStorage:", error);
          }
        });
      }

      return updatedSettings;
    });
  }, []); // Empty dependency array since we use functional state update

  // Update individual setting
  const updateSetting = useCallback(
    (key: keyof SettingsState, value: unknown) => {
      updateSettings({ [key]: value } as Partial<SettingsState>);
    },
    [updateSettings]
  );

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      settings,
      updateSettings,
      updateSetting,
      isLoaded
    }),
    [settings, updateSettings, updateSetting, isLoaded]
  );
}
