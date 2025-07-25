import { renderHook, act, waitFor } from "@testing-library/react";
import { useNotificationHandlers } from "../useNotificationHandlers";
import type {
  EmailNotificationData,
  CalendarEventData,
  SystemNotificationData,
  ChatMessageData
} from "@/lib/types/pusher";

// Mock dependencies
jest.mock("sonner", () => ({
  toast: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  startTransition: jest.fn(callback => callback())
}));

jest.mock("next-intl", () => ({
  useTranslations: () => jest.fn((key: string) => `translated_${key}`)
}));

describe("useNotificationHandlers", () => {
  const mockAddNotification = jest.fn();
  const mockSubmit = jest.fn();

  const mockAuthAuthenticated = {
    isAuthenticated: true
  };

  const mockAuthUnauthenticated = {
    isAuthenticated: false
  };

  const defaultProps = {
    auth: mockAuthAuthenticated,
    addNotification: mockAddNotification,
    submit: mockSubmit
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("initialization", () => {
    it("should return all handler functions", () => {
      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      expect(typeof result.current.handleEmailNotification).toBe("function");
      expect(typeof result.current.handleCalendarUpcoming).toBe("function");
      expect(typeof result.current.handleCalendarNew).toBe("function");
      expect(typeof result.current.handleSystemNotification).toBe("function");
      expect(typeof result.current.handleChatMessage).toBe("function");
      expect(typeof result.current.processMessageQueue).toBe("function");
    });
  });

  describe("handleEmailNotification", () => {
    it("should handle email notification correctly", () => {
      const mockEmailData: EmailNotificationData = {
        fromAddress: "sender@example.com",
        subject: "Important Email Subject",
        priority: "medium",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleEmailNotification(mockEmailData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "email",
        title: "Important Email",
        message: `${mockEmailData.subject} from ${mockEmailData.fromAddress}`,
        data: mockEmailData
      });

      const { toast } = require("sonner");
      expect(toast.info).toHaveBeenCalledWith(
        `Important Email: ${mockEmailData.subject} from ${mockEmailData.fromAddress}`,
        { duration: 180000 }
      );
    });

    it("should log email notification to console", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const mockEmailData: EmailNotificationData = {
        fromAddress: "sender@example.com",
        subject: "Test Subject",
        priority: "high",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleEmailNotification(mockEmailData);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Important email event:",
        mockEmailData
      );
      consoleSpy.mockRestore();
    });
  });

  describe("handleCalendarUpcoming", () => {
    it("should handle upcoming calendar event with time until start", () => {
      const mockCalendarData: CalendarEventData = {
        title: "Team Meeting",
        startTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
        timeUntilStart: 10,
        priority: "high",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleCalendarUpcoming(mockCalendarData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "calendar_upcoming",
        title: "Upcoming Event",
        message: `${mockCalendarData.title} in ${mockCalendarData.timeUntilStart} minutes`,
        data: mockCalendarData
      });

      const { toast } = require("sonner");
      expect(toast.info).toHaveBeenCalledWith(
        `Upcoming Event: ${mockCalendarData.title} in ${mockCalendarData.timeUntilStart} minutes`,
        { duration: 180000 }
      );
    });

    it("should handle upcoming calendar event starting soon", () => {
      const mockCalendarData: CalendarEventData = {
        title: "Stand-up Meeting",
        startTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        timeUntilStart: 5,
        priority: "medium",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleCalendarUpcoming(mockCalendarData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "calendar_upcoming",
        title: "Upcoming Event",
        message: `${mockCalendarData.title} starting soon`,
        data: mockCalendarData
      });
    });

    it("should handle calendar event with undefined timeUntilStart", () => {
      const mockCalendarData: CalendarEventData = {
        title: "Team Meeting",
        startTime: new Date().toISOString(),
        priority: "low",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleCalendarUpcoming(mockCalendarData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "calendar_upcoming",
        title: "Upcoming Event",
        message: `${mockCalendarData.title} starting soon`,
        data: mockCalendarData
      });
    });
  });

  describe("handleCalendarNew", () => {
    it("should handle new calendar event with start time", () => {
      const mockCalendarData: CalendarEventData = {
        title: "New Project Kickoff",
        startTime: new Date("2024-01-15T10:00:00Z").toISOString(),
        priority: "urgent",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleCalendarNew(mockCalendarData);
      });

      const expectedDate = new Date(
        mockCalendarData.startTime!
      ).toLocaleDateString();

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "calendar_new",
        title: "New Event Added",
        message: `${mockCalendarData.title} on ${expectedDate}`,
        data: mockCalendarData
      });

      const { toast } = require("sonner");
      expect(toast.info).toHaveBeenCalledWith(
        `New Event Added: ${mockCalendarData.title} on ${expectedDate}`,
        { duration: 180000 }
      );
    });

    it("should handle new calendar event without start time", () => {
      const mockCalendarData: CalendarEventData = {
        title: "Untimed Event",
        priority: "medium",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleCalendarNew(mockCalendarData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "calendar_new",
        title: "New Event Added",
        message: `${mockCalendarData.title} on soon`,
        data: mockCalendarData
      });
    });
  });

  describe("handleSystemNotification", () => {
    it("should handle system notification with title", () => {
      const mockSystemData: SystemNotificationData = {
        title: "System Update",
        message: "System will restart in 5 minutes",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleSystemNotification(mockSystemData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "system",
        title: mockSystemData.title,
        message: mockSystemData.message,
        data: mockSystemData
      });

      const { toast } = require("sonner");
      expect(toast.info).toHaveBeenCalledWith(
        `${mockSystemData.title}: ${mockSystemData.message}`,
        { duration: 180000 }
      );
    });

    it("should handle system notification without title", () => {
      const mockSystemData: SystemNotificationData = {
        message: "Network connectivity restored",
        timestamp: new Date().toISOString()
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleSystemNotification(mockSystemData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "system",
        title: "System Notification",
        message: mockSystemData.message,
        data: mockSystemData
      });

      const { toast } = require("sonner");
      expect(toast.info).toHaveBeenCalledWith(mockSystemData.message, {
        duration: 180000
      });
    });
  });

  describe("handleChatMessage", () => {
    it("should handle chat message when authenticated", async () => {
      const mockChatData: ChatMessageData = {
        message: "Hello, how can I help you today?",
        timestamp: new Date().toISOString(),
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleChatMessage(mockChatData);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "chat",
        title: "Proactive Message",
        message: mockChatData.message,
        data: mockChatData
      });

      // Process the message queue
      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(mockSubmit).toHaveBeenCalledWith({
        transcript: mockChatData.message
      });
    });

    it("should reject chat message when not authenticated", () => {
      const mockChatData: ChatMessageData = {
        message: "Hello, how can I help you today?",
        timestamp: new Date().toISOString(),
      };

      const unauthenticatedProps = {
        ...defaultProps,
        auth: mockAuthUnauthenticated
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(unauthenticatedProps)
      );

      act(() => {
        result.current.handleChatMessage(mockChatData);
      });

      const { toast } = require("sonner");
      expect(toast.error).toHaveBeenCalledWith(
        "translated_auth.loginToContinue"
      );
      expect(mockSubmit).not.toHaveBeenCalled();
      expect(mockAddNotification).not.toHaveBeenCalled();
    });

    it("should queue multiple chat messages", async () => {
      const mockChatData1: ChatMessageData = {
        message: "First message",
        timestamp: new Date().toISOString(),
      };

      const mockChatData2: ChatMessageData = {
        message: "Second message",
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleChatMessage(mockChatData1);
        result.current.handleChatMessage(mockChatData2);
      });

      // Should add both to queue
      expect(mockAddNotification).toHaveBeenCalledTimes(2);

      // Process first message
      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(mockSubmit).toHaveBeenCalledWith({
        transcript: mockChatData1.message
      });

      // Wait for delay between messages
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      expect(mockSubmit).toHaveBeenCalledWith({
        transcript: mockChatData2.message
      });
      expect(mockSubmit).toHaveBeenCalledTimes(2);
    });

    it("should not process queue concurrently", () => {
      const mockChatData1: ChatMessageData = {
        message: "First message",
        timestamp: new Date().toISOString(),
      };

      const mockChatData2: ChatMessageData = {
        message: "Second message",
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleChatMessage(mockChatData1);
      });

      // Start processing first message
      act(() => {
        jest.advanceTimersByTime(0);
      });

      // Add second message while first is still processing
      act(() => {
        result.current.handleChatMessage(mockChatData2);
      });

      // Should not process second message immediately
      expect(mockSubmit).toHaveBeenCalledTimes(1);
      expect(mockSubmit).toHaveBeenCalledWith({
        transcript: mockChatData1.message
      });

      // Complete first message processing delay
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      // Now second message should be processed
      expect(mockSubmit).toHaveBeenCalledTimes(2);
      expect(mockSubmit).toHaveBeenLastCalledWith({
        transcript: mockChatData2.message
      });
    });
  });

  describe("processMessageQueue", () => {
    it("should process empty queue without errors", async () => {
      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      await act(async () => {
        await result.current.processMessageQueue();
      });

      expect(mockSubmit).not.toHaveBeenCalled();
    });

    it("should process single message in queue", async () => {
      const mockChatData: ChatMessageData = {
        message: "Test message",
        timestamp: new Date().toISOString(),
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      // Add message to queue first
      act(() => {
        result.current.handleChatMessage(mockChatData);
      });

      // Process the queue manually
      await act(async () => {
        jest.advanceTimersByTime(0);
        await result.current.processMessageQueue();
      });

      expect(mockSubmit).toHaveBeenCalledWith({
        transcript: mockChatData.message
      });
    });

    it("should handle processing when already processing", async () => {
      const mockChatData: ChatMessageData = {
        message: "Test message",
        timestamp: new Date().toISOString(),
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      // Add message and start processing
      act(() => {
        result.current.handleChatMessage(mockChatData);
      });

      // Start processing
      const firstProcessPromise = act(async () => {
        await result.current.processMessageQueue();
      });

      // Try to process again while first is running
      const secondProcessPromise = act(async () => {
        await result.current.processMessageQueue();
      });

      await firstProcessPromise;
      await secondProcessPromise;

      // Should only process once
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });

    it("should wait between processing messages", async () => {
      const mockChatData1: ChatMessageData = {
        message: "First message",
        timestamp: new Date().toISOString(),
      };

      const mockChatData2: ChatMessageData = {
        message: "Second message",
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      // Add multiple messages
      act(() => {
        result.current.handleChatMessage(mockChatData1);
        result.current.handleChatMessage(mockChatData2);
      });

      // Start processing
      act(() => {
        jest.advanceTimersByTime(0);
      });

      // First message should be processed immediately
      expect(mockSubmit).toHaveBeenCalledTimes(1);
      expect(mockSubmit).toHaveBeenCalledWith({
        transcript: mockChatData1.message
      });

      // Advance by the delay time (4 seconds)
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      // Second message should now be processed
      expect(mockSubmit).toHaveBeenCalledTimes(2);
      expect(mockSubmit).toHaveBeenLastCalledWith({
        transcript: mockChatData2.message
      });
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle undefined notification data gracefully", () => {
      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      expect(() => {
        act(() => {
          result.current.handleEmailNotification(undefined as any);
        });
      }).not.toThrow();
    });

    it("should handle null calendar data gracefully", () => {
      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      expect(() => {
        act(() => {
          result.current.handleCalendarUpcoming(null as any);
        });
      }).not.toThrow();
    });

    it("should handle chat message with empty message", () => {
      const mockChatData: ChatMessageData = {
        message: "",
        timestamp: new Date().toISOString(),
      };

      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      act(() => {
        result.current.handleChatMessage(mockChatData);
      });

      // Should still add notification
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: "chat",
        title: "Proactive Message",
        message: "",
        data: mockChatData
      });

      // Should still submit empty transcript
      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(mockSubmit).toHaveBeenCalledWith({ transcript: "" });
    });

    it("should handle very long message queue", () => {
      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      // Add many messages
      const messageCount = 10;
      for (let i = 0; i < messageCount; i++) {
        const mockChatData: ChatMessageData = {
          message: `Message ${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          };

        act(() => {
          result.current.handleChatMessage(mockChatData);
        });
      }

      // Process all messages
      for (let i = 0; i < messageCount; i++) {
        act(() => {
          if (i === 0) {
            jest.advanceTimersByTime(0); // Start processing
          } else {
            jest.advanceTimersByTime(4000); // Advance by delay
          }
        });
      }

      expect(mockSubmit).toHaveBeenCalledTimes(messageCount);
    });
  });

  describe("memory management", () => {
    it("should not leak timers on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      const mockChatData: ChatMessageData = {
        message: "Test message",
        timestamp: new Date().toISOString(),
      };

      act(() => {
        result.current.handleChatMessage(mockChatData);
      });

      // Start processing but don't complete
      act(() => {
        jest.advanceTimersByTime(0);
      });

      // Unmount before completion
      unmount();

      // Advance timers - should not cause errors
      expect(() => {
        jest.advanceTimersByTime(5000);
      }).not.toThrow();
    });

    it("should handle rapid consecutive calls", () => {
      const { result } = renderHook(() =>
        useNotificationHandlers(defaultProps)
      );

      const callCount = 50;

      // Make many rapid calls
      act(() => {
        for (let i = 0; i < callCount; i++) {
          const mockSystemData: SystemNotificationData = {
            message: `Rapid message ${i}`,
            timestamp: new Date(Date.now() + i * 1000).toISOString()
          };
          result.current.handleSystemNotification(mockSystemData);
        }
      });

      expect(mockAddNotification).toHaveBeenCalledTimes(callCount);
    });
  });
});
