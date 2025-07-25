import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";
import { RefObject } from "react";

describe("useKeyboardShortcuts", () => {
  let mockInputRef: RefObject<HTMLInputElement>;
  let mockUpdateChatState: jest.Mock;
  let mockInputElement: HTMLInputElement;

  beforeEach(() => {
    // Create mock input element
    mockInputElement = {
      focus: jest.fn(),
      blur: jest.fn(),
      setAttribute: jest.fn(),
      value: "",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    } as any;

    mockInputRef = {
      current: mockInputElement
    };

    mockUpdateChatState = jest.fn();

    // Mock window event methods
    global.window.addEventListener = jest.fn();
    global.window.removeEventListener = jest.fn();

    // Mock document methods
    Object.defineProperty(document, "activeElement", {
      writable: true,
      value: null,
      configurable: true
    });

    // Mock document.activeElement.setAttribute
    const mockActiveElement = {
      setAttribute: jest.fn()
    };
    Object.defineProperty(document, "activeElement", {
      value: mockActiveElement,
      writable: true,
      configurable: true
    });

    // Clear all event listeners
    jest.clearAllMocks();
  });

  describe("authenticated user shortcuts", () => {
    const getAuthenticatedConfig = () => ({
      isAuthenticated: true,
      inputRef: mockInputRef,
      updateChatState: mockUpdateChatState
    });

    it("should focus input on Enter key when not focused on input", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      // Get the keydown event listener
      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      expect(keydownCalls).toHaveLength(1);

      const keydownHandler = keydownCalls[0][1];

      // Simulate Enter key press when not on input
      const enterEvent = {
        key: "Enter",
        target: document.body, // Not the input element
        preventDefault: jest.fn()
      };

      keydownHandler(enterEvent);

      expect(enterEvent.preventDefault).toHaveBeenCalled();
      expect(mockInputElement.focus).toHaveBeenCalled();
    });

    it("should not focus input on Enter key when already focused on input", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Simulate Enter key press when on input element
      const enterEvent = {
        key: "Enter",
        target: mockInputElement,
        preventDefault: jest.fn()
      };

      keydownHandler(enterEvent);

      expect(enterEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockInputElement.focus).not.toHaveBeenCalled();
    });

    it("should clear input and blur on Escape key", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Simulate Escape key press
      const escapeEvent = {
        key: "Escape",
        target: document.body,
        preventDefault: jest.fn()
      };

      keydownHandler(escapeEvent);

      expect(escapeEvent.preventDefault).toHaveBeenCalled();
      expect(mockUpdateChatState).toHaveBeenCalledWith({ input: "" });
      expect(mockInputElement.blur).toHaveBeenCalled();
    });

    it("should focus input on Ctrl+/ shortcut", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Simulate Ctrl+/ key press
      const ctrlSlashEvent = {
        key: "/",
        ctrlKey: true,
        target: document.body,
        preventDefault: jest.fn()
      };

      keydownHandler(ctrlSlashEvent);

      expect(ctrlSlashEvent.preventDefault).toHaveBeenCalled();
      expect(mockInputElement.focus).toHaveBeenCalled();
    });

    it("should handle keyup events for Tab key", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keyupCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keyup");
      expect(keyupCalls).toHaveLength(1);

      const keyupHandler = keyupCalls[0][1];

      // Simulate Tab key release
      const tabEvent = {
        key: "Tab"
      };

      keyupHandler(tabEvent);

      expect(document.activeElement?.setAttribute).toHaveBeenCalledWith(
        "data-focus-visible",
        "true"
      );
    });

    it("should handle Tab key when no active element", () => {
      // Set activeElement to null
      Object.defineProperty(document, "activeElement", {
        value: null,
        writable: true,
        configurable: true
      });

      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keyupCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keyup");
      const keyupHandler = keyupCalls[0][1];

      // Simulate Tab key release with no active element
      const tabEvent = {
        key: "Tab"
      };

      // Should not throw error
      expect(() => keyupHandler(tabEvent)).not.toThrow();
    });

    it("should ignore non-shortcut keys", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Simulate random key press
      const randomEvent = {
        key: "a",
        target: document.body,
        preventDefault: jest.fn()
      };

      keydownHandler(randomEvent);

      expect(randomEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockInputElement.focus).not.toHaveBeenCalled();
      expect(mockUpdateChatState).not.toHaveBeenCalled();
    });

    it("should handle Escape key with different target elements", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Test with different target elements
      const targets = [
        document.body,
        mockInputElement,
        document.createElement("div")
      ];

      targets.forEach((target, index) => {
        const escapeEvent = {
          key: "Escape",
          target,
          preventDefault: jest.fn()
        };

        keydownHandler(escapeEvent);

        expect(escapeEvent.preventDefault).toHaveBeenCalled();
        expect(mockUpdateChatState).toHaveBeenCalledWith({ input: "" });
        expect(mockInputElement.blur).toHaveBeenCalled();
      });

      // Should be called once for each target
      expect(mockUpdateChatState).toHaveBeenCalledTimes(targets.length);
      expect(mockInputElement.blur).toHaveBeenCalledTimes(targets.length);
    });

    it("should handle Ctrl+/ without Ctrl modifier (should not trigger)", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Simulate / key press without Ctrl
      const slashEvent = {
        key: "/",
        ctrlKey: false,
        target: document.body,
        preventDefault: jest.fn()
      };

      keydownHandler(slashEvent);

      expect(slashEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockInputElement.focus).not.toHaveBeenCalled();
    });
  });

  describe("unauthenticated user shortcuts", () => {
    const getUnauthenticatedConfig = () => ({
      isAuthenticated: false,
      inputRef: mockInputRef,
      updateChatState: mockUpdateChatState
    });

    it("should not respond to any shortcuts when not authenticated", () => {
      renderHook(() => useKeyboardShortcuts(getUnauthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Test all shortcuts
      const shortcuts = [
        { key: "Enter", target: document.body },
        { key: "Escape", target: document.body },
        { key: "/", ctrlKey: true, target: document.body }
      ];

      shortcuts.forEach(shortcut => {
        const event = {
          ...shortcut,
          preventDefault: jest.fn()
        };

        keydownHandler(event);

        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(mockInputElement.focus).not.toHaveBeenCalled();
        expect(mockInputElement.blur).not.toHaveBeenCalled();
        expect(mockUpdateChatState).not.toHaveBeenCalled();
      });
    });

    it("should still handle keyup events when not authenticated", () => {
      renderHook(() => useKeyboardShortcuts(getUnauthenticatedConfig()));

      const keyupCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keyup");
      expect(keyupCalls).toHaveLength(1);

      const keyupHandler = keyupCalls[0][1];

      // Simulate Tab key release
      const tabEvent = {
        key: "Tab"
      };

      keyupHandler(tabEvent);

      expect(document.activeElement?.setAttribute).toHaveBeenCalledWith(
        "data-focus-visible",
        "true"
      );
    });
  });

  describe("edge cases and error handling", () => {
    const getAuthenticatedConfig = () => ({
      isAuthenticated: true,
      inputRef: mockInputRef,
      updateChatState: mockUpdateChatState
    });

    it("should handle null input ref gracefully", () => {
      const nullRefConfig = {
        ...getAuthenticatedConfig(),
        inputRef: { current: null }
      };

      renderHook(() => useKeyboardShortcuts(nullRefConfig));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Should not throw when input ref is null
      const enterEvent = {
        key: "Enter",
        target: document.body,
        preventDefault: jest.fn()
      };

      expect(() => keydownHandler(enterEvent)).not.toThrow();
      expect(enterEvent.preventDefault).toHaveBeenCalled();
    });

    it("should handle focus and blur errors gracefully", () => {
      // Mock input element that throws on focus/blur
      const errorInputElement = {
        focus: jest.fn(() => {
          throw new Error("Focus failed");
        }),
        blur: jest.fn(() => {
          throw new Error("Blur failed");
        }),
        setAttribute: jest.fn()
      } as any;

      const errorRefConfig = {
        ...getAuthenticatedConfig(),
        inputRef: { current: errorInputElement }
      };

      renderHook(() => useKeyboardShortcuts(errorRefConfig));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Should handle focus errors
      const enterEvent = {
        key: "Enter",
        target: document.body,
        preventDefault: jest.fn()
      };

      expect(() => keydownHandler(enterEvent)).not.toThrow();

      // Should handle blur errors
      const escapeEvent = {
        key: "Escape",
        target: document.body,
        preventDefault: jest.fn()
      };

      expect(() => keydownHandler(escapeEvent)).not.toThrow();
    });

    it("should handle events with missing properties", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Event with minimal properties
      const minimalEvent = {
        key: "Enter"
        // Missing target, preventDefault, etc.
      };

      expect(() => keydownHandler(minimalEvent)).not.toThrow();
    });

    it("should handle rapid key presses", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Rapid Enter key presses
      for (let i = 0; i < 10; i++) {
        const enterEvent = {
          key: "Enter",
          target: document.body,
          preventDefault: jest.fn()
        };

        keydownHandler(enterEvent);
        expect(enterEvent.preventDefault).toHaveBeenCalled();
      }

      expect(mockInputElement.focus).toHaveBeenCalledTimes(10);
    });

    it("should handle combination keys correctly", () => {
      renderHook(() => useKeyboardShortcuts(getAuthenticatedConfig()));

      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[0][1];

      // Test various modifier combinations
      const combinations = [
        { key: "/", ctrlKey: true, shiftKey: false, altKey: false }, // Should work
        { key: "/", ctrlKey: true, shiftKey: true, altKey: false }, // Should work
        { key: "/", ctrlKey: false, shiftKey: true, altKey: false }, // Should not work
        { key: "/", ctrlKey: true, shiftKey: false, altKey: true } // Should work
      ];

      combinations.forEach((combo, index) => {
        const event = {
          ...combo,
          target: document.body,
          preventDefault: jest.fn()
        };

        keydownHandler(event);

        if (combo.ctrlKey) {
          expect(event.preventDefault).toHaveBeenCalled();
          expect(mockInputElement.focus).toHaveBeenCalled();
        } else {
          expect(event.preventDefault).not.toHaveBeenCalled();
        }
      });
    });
  });

  describe("cleanup and memory management", () => {
    it("should remove event listeners on unmount", () => {
      const { unmount } = renderHook(() =>
        useKeyboardShortcuts({
          isAuthenticated: true,
          inputRef: mockInputRef,
          updateChatState: mockUpdateChatState
        })
      );

      // Verify event listeners were added
      expect(window.addEventListener).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
      expect(window.addEventListener).toHaveBeenCalledWith(
        "keyup",
        expect.any(Function)
      );

      // Clear the mock to check removeEventListener calls
      jest.clearAllMocks();

      // Unmount the hook
      unmount();

      // Verify event listeners were removed
      expect(window.removeEventListener).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function)
      );
      expect(window.removeEventListener).toHaveBeenCalledWith(
        "keyup",
        expect.any(Function)
      );
    });

    it("should handle multiple mount/unmount cycles", () => {
      const config = {
        isAuthenticated: true,
        inputRef: mockInputRef,
        updateChatState: mockUpdateChatState
      };

      // Mount and unmount multiple times
      for (let i = 0; i < 3; i++) {
        const { unmount } = renderHook(() => useKeyboardShortcuts(config));
        unmount();
      }

      // Should not cause memory leaks or errors
      expect(window.addEventListener).toHaveBeenCalled();
      expect(window.removeEventListener).toHaveBeenCalled();
    });

    it("should handle config changes during lifecycle", () => {
      let isAuthenticated = true;
      const { rerender } = renderHook(
        ({ authenticated }) =>
          useKeyboardShortcuts({
            isAuthenticated: authenticated,
            inputRef: mockInputRef,
            updateChatState: mockUpdateChatState
          }),
        { initialProps: { authenticated: isAuthenticated } }
      );

      // Change authentication state
      isAuthenticated = false;
      rerender({ authenticated: isAuthenticated });

      // Should still work without errors
      const keydownCalls = (
        window.addEventListener as jest.Mock
      ).mock.calls.filter(call => call[0] === "keydown");
      const keydownHandler = keydownCalls[keydownCalls.length - 1][1]; // Get latest handler

      const enterEvent = {
        key: "Enter",
        target: document.body,
        preventDefault: jest.fn()
      };

      keydownHandler(enterEvent);

      // Should not trigger when not authenticated
      expect(enterEvent.preventDefault).not.toHaveBeenCalled();
    });
  });
});
