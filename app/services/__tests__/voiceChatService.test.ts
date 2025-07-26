import { VoiceChatService } from "../voiceChatService";
import type { Message, ChatSubmissionData } from "../../types/voiceChat";
import * as localeUtils from "../../utils/localeUtils";

// Mock the locale utils
jest.mock("../../utils/localeUtils", () => ({
  getCurrentLocale: jest.fn(() => "en")
}));

const mockLocaleUtils = localeUtils as jest.Mocked<typeof localeUtils>;

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("VoiceChatService", () => {
  let service: VoiceChatService;
  let mockAbortController: AbortController;

  beforeEach(() => {
    service = new VoiceChatService();
    mockAbortController = new AbortController();
    jest.clearAllMocks();
  });

  describe("submitChat", () => {
    const mockMessages: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" }
    ];
    const mockSettings = { audioEnabled: true };
    const mockToken = "test-token";

    it("should submit text input successfully", async () => {
      const mockResponse = new Response("success", { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.submitChat(
        "Hello world",
        mockMessages,
        mockSettings,
        mockToken,
        mockAbortController.signal
      );

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith("/api", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Accept-Language": "en"
        },
        body: expect.any(FormData),
        signal: mockAbortController.signal
      });
    });

    it("should submit blob input successfully", async () => {
      const mockBlob = new Blob(["audio data"], { type: "audio/webm" });
      const mockResponse = new Response("success", { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      await service.submitChat(
        mockBlob,
        mockMessages,
        mockSettings,
        mockToken,
        mockAbortController.signal
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "/api",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData)
        })
      );
    });

    it("should submit transcript object successfully", async () => {
      const mockTranscript = { transcript: "Hello from transcript" };
      const mockResponse = new Response("success", { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      await service.submitChat(
        mockTranscript,
        mockMessages,
        mockSettings,
        mockToken,
        mockAbortController.signal
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "/api",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData)
        })
      );
    });

    it("should handle reset input", async () => {
      const mockResponse = new Response("success", { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      await service.submitChat(
        "__reset__",
        mockMessages,
        mockSettings,
        mockToken,
        mockAbortController.signal
      );

      expect(mockFetch).toHaveBeenCalled();
    });

    it("should throw error for invalid data type", async () => {
      await expect(
        service.submitChat(
          123 as any,
          mockMessages,
          mockSettings,
          mockToken,
          mockAbortController.signal
        )
      ).rejects.toThrow("Invalid data type for chat submission");
    });

    it("should handle 401 unauthorized error", async () => {
      const mockResponse = new Response("Unauthorized", { status: 401 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        service.submitChat(
          "test",
          mockMessages,
          mockSettings,
          mockToken,
          mockAbortController.signal
        )
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("should handle 429 rate limit error", async () => {
      const mockResponse = new Response("Too Many Requests", { status: 429 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        service.submitChat(
          "test",
          mockMessages,
          mockSettings,
          mockToken,
          mockAbortController.signal
        )
      ).rejects.toThrow("TOO_MANY_REQUESTS");
    });

    it("should include authorization header when token provided", async () => {
      const mockResponse = new Response("success", { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      await service.submitChat(
        "test",
        mockMessages,
        mockSettings,
        "my-token",
        mockAbortController.signal
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "/api",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-token"
          })
        })
      );
    });

    it("should not include authorization header when token is null", async () => {
      const mockResponse = new Response("success", { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      await service.submitChat(
        "test",
        mockMessages,
        mockSettings,
        null,
        mockAbortController.signal
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "/api",
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.anything()
          })
        })
      );
    });
  });

  describe("response handling methods", () => {
    let mockResponse: Response;

    beforeEach(() => {
      const headers = new Headers();
      mockResponse = new Response(null, { headers });
    });

    describe("extractTranscript", () => {
      it("should extract and decode transcript from headers", () => {
        mockResponse.headers.set(
          "X-Transcript",
          encodeURIComponent("Hello world")
        );
        const result = service.extractTranscript(mockResponse);
        expect(result).toBe("Hello world");
      });

      it("should return empty string when header not present", () => {
        const result = service.extractTranscript(mockResponse);
        expect(result).toBe("");
      });
    });

    describe("getResponseType", () => {
      it("should return response type from headers", () => {
        mockResponse.headers.set("X-Response-Type", "streaming");
        const result = service.getResponseType(mockResponse);
        expect(result).toBe("streaming");
      });

      it("should return null when header not present", () => {
        const result = service.getResponseType(mockResponse);
        expect(result).toBeNull();
      });
    });

    describe("extractResponseText", () => {
      it("should extract and decode response text from headers", () => {
        mockResponse.headers.set(
          "X-Response-Text",
          encodeURIComponent("Response text")
        );
        const result = service.extractResponseText(mockResponse);
        expect(result).toBe("Response text");
      });

      it("should return empty string when header not present", () => {
        const result = service.extractResponseText(mockResponse);
        expect(result).toBe("");
      });
    });
  });

  describe("handleSingleResponse", () => {
    it("should process single response with audio", async () => {
      const mockResponse = new Response(new ArrayBuffer(8));
      mockResponse.headers.set("X-Response-Text", encodeURIComponent("Hello"));

      const userMessage: Message = { role: "user", content: "Hi" };
      const submittedAt = Date.now();
      const onAudioChunk = jest.fn();

      const result = await service.handleSingleResponse(
        mockResponse,
        userMessage,
        submittedAt,
        onAudioChunk
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(userMessage);
      expect(result[1]).toEqual({
        role: "assistant",
        content: "Hello",
        latency: expect.any(Number)
      });
      expect(onAudioChunk).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    });

    it("should throw error when no response text", async () => {
      const headers = new Headers();
      const mockResponse = new Response(null, { headers });

      const userMessage: Message = { role: "user", content: "Hi" };
      const onAudioChunk = jest.fn();

      await expect(
        service.handleSingleResponse(
          mockResponse,
          userMessage,
          Date.now(),
          onAudioChunk
        )
      ).rejects.toThrow("NO_RESPONSE_TEXT");
    });
  });

  describe("handleTextOnlyResponse", () => {
    it("should process text-only response", async () => {
      const mockResponse = new Response();
      mockResponse.headers.set(
        "X-Response-Text",
        encodeURIComponent("Text response")
      );

      const userMessage: Message = { role: "user", content: "Hi" };
      const submittedAt = Date.now();

      const result = await service.handleTextOnlyResponse(
        mockResponse,
        userMessage,
        submittedAt
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(userMessage);
      expect(result[1]).toEqual({
        role: "assistant",
        content: "Text response",
        latency: expect.any(Number)
      });
    });

    it("should throw error when no response text", async () => {
      const headers = new Headers();
      const mockResponse = new Response(null, { headers });

      const userMessage: Message = { role: "user", content: "Hi" };

      await expect(
        service.handleTextOnlyResponse(mockResponse, userMessage, Date.now())
      ).rejects.toThrow("NO_RESPONSE_TEXT");
    });
  });

  describe("translateError", () => {
    const mockT = jest.fn((key: string) => `translated_${key}`);

    it("should translate known error messages", () => {
      const result = service.translateError("Invalid audio", mockT);
      expect(result).toBe("translated_errors.invalidAudio");
    });

    it("should return original message for unknown errors", () => {
      const result = service.translateError("Unknown error", mockT);
      expect(result).toBe("Unknown error");
    });

    it("should fallback to common error when message is empty", () => {
      const result = service.translateError("", mockT);
      expect(result).toBe("translated_common.error");
    });
  });
});
