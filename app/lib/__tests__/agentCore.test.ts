import { AgentCoreService } from "../agentCore";

// Mock the config
jest.mock("@/config", () => ({
  agentCoreConfig: {
    baseURL: "http://localhost:3030/api/v1",
    streamTimeout: 30000
  }
}));

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock console methods
const mockConsoleInfo = jest.spyOn(console, "info").mockImplementation();
const mockConsoleWarn = jest.spyOn(console, "warn").mockImplementation();
const mockConsoleError = jest.spyOn(console, "error").mockImplementation();

// Mock ReadableStream for streaming tests
class MockReadableStream {
  private reader: any;

  constructor(private chunks: string[]) {
    this.reader = {
      read: jest.fn().mockImplementation(() => {
        if (this.chunks.length > 0) {
          const chunk = this.chunks.shift();
          return Promise.resolve({
            done: false,
            value: new TextEncoder().encode(chunk)
          });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
      releaseLock: jest.fn()
    };
  }

  getReader() {
    return this.reader;
  }
}

describe("AgentCoreService", () => {
  let service: AgentCoreService;
  let mockLogout: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogout = jest.fn();
    service = new AgentCoreService(mockLogout);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with correct baseURL and streamTimeout", () => {
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        "Initialized Agent-Core Engine with base URL: http://localhost:3030/api/v1"
      );
    });

    it("should work without logout callback", () => {
      const serviceWithoutCallback = new AgentCoreService();
      expect(serviceWithoutCallback).toBeInstanceOf(AgentCoreService);
    });
  });

  describe("401 Error Handling in handleResponse", () => {
    it("should trigger logout callback on 401 response in initChat", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue("Unauthorized")
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.initChat("invalid-token", { locale: "en" })
      ).rejects.toThrow("HTTP 401: Unauthorized");

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "Received 401 Unauthorized - triggering logout"
      );
    });

    it("should trigger logout callback on 401 response in clearHistory", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue("Unauthorized")
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        service.clearHistory("invalid-token", { locale: "en" })
      ).rejects.toThrow("HTTP 401: Unauthorized");

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "Received 401 Unauthorized - triggering logout"
      );
    });
  });

  describe("401 Error Handling in chatStream", () => {
    it("should trigger logout callback on 401 response in chatStream", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue("Unauthorized")
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const generator = service.chatStream("test message", "invalid-token", {
        locale: "en"
      });

      await expect(generator.next()).rejects.toThrow("HTTP 401: Unauthorized");

      // Should be called twice: once in chatStream and once in handleResponse
      expect(mockLogout).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "Received 401 Unauthorized in stream - triggering logout"
      );
    });

    it("should trigger logout in chatStream before calling handleResponse", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue("Unauthorized")
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const generator = service.chatStream("test message", "invalid-token");

      await expect(generator.next()).rejects.toThrow("HTTP 401: Unauthorized");

      // Should be called twice: once in chatStream and once in handleResponse
      expect(mockLogout).toHaveBeenCalledTimes(2);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "Received 401 Unauthorized in stream - triggering logout"
      );
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        "Received 401 Unauthorized - triggering logout"
      );
    });

    it("should handle successful streaming with proper logout on 401", async () => {
      // First call succeeds, second call returns 401
      const mockSuccessResponse = {
        ok: true,
        status: 200,
        body: new MockReadableStream([
          'event: text\ndata: {"data": "Hello"}\n\n',
          "data: [DONE]\n\n"
        ])
      } as any;

      const mockFailResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue("Unauthorized")
      } as any;

      mockFetch
        .mockResolvedValueOnce(mockSuccessResponse)
        .mockResolvedValueOnce(mockFailResponse);

      // First call should succeed
      const generator1 = service.chatStream("test message 1", "valid-token");
      const result1 = await generator1.next();
      expect(result1.value).toEqual({
        type: "text",
        text: "Hello",
        metadata: undefined
      });

      // Second call should trigger logout
      const generator2 = service.chatStream("test message 2", "invalid-token");
      await expect(generator2.next()).rejects.toThrow("HTTP 401: Unauthorized");

      expect(mockLogout).toHaveBeenCalledTimes(2);
    });
  });

  describe("Successful API calls", () => {
    it("should successfully initialize chat", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await service.initChat("valid-token", {
        timezone: "UTC",
        clientDatetime: "2023-01-01T00:00:00Z",
        locale: "en"
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3030/api/v1/chat/init",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer valid-token",
            "X-Client-Timezone": "UTC",
            "X-Client-Datetime": "2023-01-01T00:00:00Z",
            "X-Locale": "en"
          }),
          body: JSON.stringify({})
        })
      );

      expect(mockLogout).not.toHaveBeenCalled();
    });

    it("should successfully stream chat", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        body: new MockReadableStream([
          'event: text\ndata: {"data": "Hello"}\n\n',
          'event: text\ndata: {"data": " world"}\n\n',
          "data: [DONE]\n\n"
        ])
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const generator = service.chatStream("test message", "valid-token");
      const chunks = [];

      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        {
          type: "text",
          text: "Hello",
          metadata: undefined
        },
        {
          type: "text",
          text: " world",
          metadata: undefined
        }
      ]);
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  describe("Error scenarios", () => {
    it("should handle abort errors in streaming", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        body: new MockReadableStream(['data: {"text": "Hello"}\n\n'])
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const abortController = new AbortController();
      const generator = service.chatStream(
        "test message",
        "valid-token",
        undefined,
        abortController.signal
      );

      // Abort immediately
      abortController.abort();

      // Should exit gracefully without calling logout
      const result = await generator.next();
      expect(result.done).toBe(true);
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  describe("Health check", () => {
    it("should perform health check successfully", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ status: "healthy" })
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const result = await service.healthCheck({ locale: "en" });

      expect(result).toEqual({ status: "healthy" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3030/api/v1/health",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Locale": "en"
          })
        })
      );
    });

    it("should trigger logout on 401 in health check", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue("Unauthorized")
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await expect(service.healthCheck({ locale: "en" })).rejects.toThrow(
        "HTTP 401: Unauthorized"
      );

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe("Locale mapping", () => {
    it("should map zh-TW locale to zh", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await service.initChat("valid-token", { locale: "zh-TW" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Locale": "zh"
          })
        })
      );
    });

    it("should handle unsupported locale", async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true })
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await service.initChat("valid-token", { locale: "unsupported" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            "X-Locale": expect.any(String)
          })
        })
      );
    });
  });
});
