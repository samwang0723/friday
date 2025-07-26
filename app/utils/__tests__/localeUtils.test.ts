import {
  detectBrowserLocale,
  getCurrentLocale,
  normalizeLocale,
  setLocaleCookie,
  setLocaleInStorage,
  validateLocale
} from "../localeUtils";

// Store original implementations
const originalWindow = global.window;
const originalDocument = global.document;
const originalLocalStorage = global.localStorage;
const originalNavigator = global.navigator;

describe("localeUtils", () => {
  let mockLocalStorage: any;
  let urlSearchParamsSpy: jest.SpyInstance;
  let localStorageGetItemSpy: jest.SpyInstance;
  let localStorageSetItemSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockLocalStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn()
    };

    // Store URLSearchParams behavior for each test
    const mockSearchParams: Map<string, string> = new Map();

    // Mock URLSearchParams to control what it returns
    urlSearchParamsSpy = jest
      .spyOn(global, "URLSearchParams")
      .mockImplementation(() => {
        return {
          get: (key: string) => mockSearchParams.get(key) || null
        } as any;
      });

    // Expose method to set mock search params for tests
    (global as any).setMockSearchParams = (params: Record<string, string>) => {
      mockSearchParams.clear();
      Object.entries(params).forEach(([key, value]) => {
        mockSearchParams.set(key, value);
      });
    };

    // Store document.cookie value for each test
    let cookieValue = "";

    // Mock document.cookie getter/setter
    Object.defineProperty(document, "cookie", {
      get: () => cookieValue,
      set: (value: string) => {
        cookieValue = value;
      },
      configurable: true
    });

    // Expose method to set mock cookie for tests
    (global as any).setMockCookie = (cookie: string) => {
      cookieValue = cookie;
    };

    // Mock localStorage methods using Jest spies
    localStorageGetItemSpy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(mockLocalStorage.getItem);
    localStorageSetItemSpy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(mockLocalStorage.setItem);

    // Use Object.defineProperty to mock navigator.language
    Object.defineProperty(global.navigator, "language", {
      value: "en-US",
      writable: true,
      configurable: true
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore spies
    urlSearchParamsSpy.mockRestore();
    localStorageGetItemSpy.mockRestore();
    localStorageSetItemSpy.mockRestore();

    // Clean up test helpers
    delete (global as any).setMockSearchParams;
    delete (global as any).setMockCookie;

    // Restore original globals
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
    global.navigator = originalNavigator;
  });

  describe("getCurrentLocale", () => {
    it("should return locale from URL parameters", () => {
      (global as any).setMockSearchParams({ locale: "fr" });
      const result = getCurrentLocale();
      expect(result).toBe("fr");
    });

    it("should return locale from cookies when URL param not available", () => {
      (global as any).setMockSearchParams({});
      (global as any).setMockCookie("locale=es; path=/");
      const result = getCurrentLocale();
      expect(result).toBe("es");
    });

    it("should return locale from localStorage when cookies not available", () => {
      (global as any).setMockSearchParams({});
      (global as any).setMockCookie("");
      mockLocalStorage.getItem.mockReturnValue("ja");
      const result = getCurrentLocale();
      expect(result).toBe("ja");
    });

    it("should return default locale when nothing is available", () => {
      (global as any).setMockSearchParams({});
      (global as any).setMockCookie("");
      mockLocalStorage.getItem.mockReturnValue(null);
      const result = getCurrentLocale();
      expect(result).toBe("en");
    });

    it("should handle malformed cookies gracefully", () => {
      (global as any).setMockSearchParams({});
      (global as any).setMockCookie("malformed_cookie");
      mockLocalStorage.getItem.mockReturnValue(null);
      const result = getCurrentLocale();
      expect(result).toBe("en");
    });
  });

  describe("detectBrowserLocale", () => {
    it("should return browser language without region", () => {
      Object.defineProperty(global.navigator, "language", {
        value: "fr-FR",
        writable: true,
        configurable: true
      });
      const result = detectBrowserLocale();
      expect(result).toBe("fr");
    });

    it("should return default when navigator is not available", () => {
      // @ts-expect-error
      delete global.navigator;

      const result = detectBrowserLocale();
      expect(result).toBe("en");
    });
  });

  describe("setLocaleInStorage", () => {
    it("should set locale in localStorage", () => {
      setLocaleInStorage("ko");
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith("locale", "ko");
    });

    it("should handle unavailable localStorage gracefully", () => {
      // @ts-expect-error
      delete global.localStorage;

      expect(() => setLocaleInStorage("ko")).not.toThrow();
    });
  });

  describe("setLocaleCookie", () => {
    it("should set locale cookie with default expiry", () => {
      const mockSetCookie = jest.fn();
      Object.defineProperty(document, "cookie", {
        set: mockSetCookie,
        configurable: true
      });

      setLocaleCookie("zh");
      expect(mockSetCookie).toHaveBeenCalledWith(
        expect.stringContaining("locale=zh")
      );
    });

    it("should handle unavailable document gracefully", () => {
      // @ts-expect-error
      delete global.document;

      expect(() => setLocaleCookie("zh")).not.toThrow();
    });
  });

  describe("validateLocale", () => {
    it("should return true for supported locales", () => {
      expect(validateLocale("en")).toBe(true);
      expect(validateLocale("es")).toBe(true);
      expect(validateLocale("fr")).toBe(true);
      expect(validateLocale("ja")).toBe(true);
      expect(validateLocale("ko")).toBe(true);
      expect(validateLocale("zh-TW")).toBe(true);
      expect(validateLocale("zh")).toBe(true);
    });

    it("should return false for unsupported locales", () => {
      expect(validateLocale("de")).toBe(false);
      expect(validateLocale("it")).toBe(false);
      expect(validateLocale("invalid")).toBe(false);
    });
  });

  describe("normalizeLocale", () => {
    it("should normalize common locale variations", () => {
      expect(normalizeLocale("zh-cn")).toBe("zh");
      expect(normalizeLocale("zh-tw")).toBe("zh-TW");
      expect(normalizeLocale("zh-hk")).toBe("zh-TW");
      expect(normalizeLocale("ZH-CN")).toBe("zh");
    });

    it("should return original locale if no normalization needed", () => {
      expect(normalizeLocale("en")).toBe("en");
      expect(normalizeLocale("fr")).toBe("fr");
    });
  });
});
