import { renderHook, act } from "@testing-library/react";
import { useLocaleManager } from "../useLocaleManager";
import * as localeUtils from "../../utils/localeUtils";

// Mock the utility functions
jest.mock("../../utils/localeUtils", () => ({
  getCurrentLocale: jest.fn(),
  detectBrowserLocale: jest.fn(),
  setLocaleInStorage: jest.fn(),
  setLocaleCookie: jest.fn(),
  validateLocale: jest.fn(),
  normalizeLocale: jest.fn()
}));

const mockLocaleUtils = localeUtils as jest.Mocked<typeof localeUtils>;

describe("useLocaleManager", () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock returns
    mockLocaleUtils.getCurrentLocale.mockReturnValue("en");
    mockLocaleUtils.detectBrowserLocale.mockReturnValue("en");
    mockLocaleUtils.validateLocale.mockReturnValue(true);
    mockLocaleUtils.normalizeLocale.mockImplementation(locale => locale);

    // Ensure window object exists (don't redefine if already exists)
    if (typeof global.window === "undefined") {
      Object.defineProperty(global, "window", {
        value: {},
        writable: true,
        configurable: true
      });
    }
  });

  it("should initialize with default locale", () => {
    const { result } = renderHook(() => useLocaleManager());

    expect(result.current.clientLocale).toBe("en");
    expect(result.current.isLocaleInitialized).toBe(true);
  });

  it("should initialize locale from getCurrentLocale", async () => {
    mockLocaleUtils.getCurrentLocale.mockReturnValue("fr");
    mockLocaleUtils.normalizeLocale.mockReturnValue("fr");
    mockLocaleUtils.validateLocale.mockReturnValue(true);

    const { result } = renderHook(() => useLocaleManager());

    // Wait for the effect to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.clientLocale).toBe("fr");
    expect(result.current.isLocaleInitialized).toBe(true);
    expect(result.current.getCurrentLocale()).toBe("fr");
  });

  it("should fallback to browser locale when current locale is invalid", async () => {
    mockLocaleUtils.getCurrentLocale.mockReturnValue("invalid");
    mockLocaleUtils.normalizeLocale.mockReturnValue("invalid");
    mockLocaleUtils.validateLocale
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    mockLocaleUtils.detectBrowserLocale.mockReturnValue("es");

    const { result } = renderHook(() => useLocaleManager());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.clientLocale).toBe("es");
    expect(mockLocaleUtils.setLocaleInStorage).toHaveBeenCalledWith("es");
    expect(mockLocaleUtils.setLocaleCookie).toHaveBeenCalledWith("es");
  });

  it('should fallback to "en" when browser locale is also invalid', async () => {
    mockLocaleUtils.getCurrentLocale.mockReturnValue("invalid");
    mockLocaleUtils.normalizeLocale.mockReturnValue("invalid");
    mockLocaleUtils.validateLocale.mockReturnValue(false);
    mockLocaleUtils.detectBrowserLocale.mockReturnValue("also-invalid");

    const { result } = renderHook(() => useLocaleManager());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.clientLocale).toBe("en");
    expect(mockLocaleUtils.setLocaleInStorage).toHaveBeenCalledWith("en");
    expect(mockLocaleUtils.setLocaleCookie).toHaveBeenCalledWith("en");
  });

  it("should handle initialization errors gracefully", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    mockLocaleUtils.getCurrentLocale.mockImplementation(() => {
      throw new Error("Test error");
    });

    const { result } = renderHook(() => useLocaleManager());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.clientLocale).toBe("en");
    expect(result.current.isLocaleInitialized).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error initializing locale:",
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it("should return default locale when not initialized", () => {
    const { result } = renderHook(() => useLocaleManager());

    expect(result.current.getCurrentLocale()).toBe("en");
  });

  it("should handle browser environment correctly", () => {
    // In a JSDOM environment, window is always available, so the hook will initialize
    // This test verifies that the hook works correctly in a browser-like environment
    const { result } = renderHook(() => useLocaleManager());

    expect(result.current.clientLocale).toBe("en");
    expect(result.current.isLocaleInitialized).toBe(true);
    expect(mockLocaleUtils.getCurrentLocale).toHaveBeenCalled();
  });
});
