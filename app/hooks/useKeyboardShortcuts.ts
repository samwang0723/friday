import { useEffect } from "react";
import type { KeyboardShortcutsConfig } from "@/types/voiceChat";

export function useKeyboardShortcuts({
  isAuthenticated,
  inputRef,
  updateChatState
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isAuthenticated) return;

      // Focus input on Enter key
      if (e.key === "Enter" && e.target !== inputRef.current) {
        e.preventDefault?.();
        try {
          inputRef.current?.focus();
        } catch (error) {
          console.warn("Failed to focus input:", error);
        }
        return;
      }

      // Clear input on Escape key
      if (e.key === "Escape") {
        e.preventDefault?.();
        updateChatState({ input: "" });
        try {
          inputRef.current?.blur();
        } catch (error) {
          console.warn("Failed to blur input:", error);
        }
        return;
      }

      // Additional accessibility shortcuts
      if (e.key === "/" && e.ctrlKey) {
        e.preventDefault?.();
        try {
          inputRef.current?.focus();
        } catch (error) {
          console.warn("Failed to focus input:", error);
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      // Handle any key-up specific logic here
      if (e.key === "Tab") {
        // Ensure focus is visible
        document.activeElement?.setAttribute("data-focus-visible", "true");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isAuthenticated, inputRef, updateChatState]);
}
