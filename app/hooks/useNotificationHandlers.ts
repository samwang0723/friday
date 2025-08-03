import type {
  CalendarEventData,
  ChatMessageData,
  EmailNotificationData,
  SystemNotificationData
} from "@/lib/types/pusher";
import type { NotificationHandlersHookReturn } from "@/types/voiceChat";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

interface UseNotificationHandlersProps {
  auth: {
    isAuthenticated: boolean;
  };
  addNotification: (notification: any) => void;
  updateChatState?: (updates: { message: string }) => void;
}

export function useNotificationHandlers({
  auth,
  addNotification,
  updateChatState
}: UseNotificationHandlersProps): NotificationHandlersHookReturn {
  const t = useTranslations();

  // Chat message queue system
  const messageQueueRef = useRef<ChatMessageData[]>([]);
  const isProcessingRef = useRef(false);

  const handleEmailNotification = useCallback(
    (data: EmailNotificationData) => {
      console.log("Important email event:", data);
      const message = `Important Email: ${data.subject} from ${data.fromAddress}`;

      addNotification({
        type: "email",
        title: "Important Email",
        message: `${data.subject} from ${data.fromAddress}`,
        data
      });

      toast.info(message, {
        duration: 180000 // 3 minutes
      });
    },
    [addNotification]
  );

  const handleCalendarUpcoming = useCallback(
    (data: CalendarEventData) => {
      console.log("Upcoming calendar event:", data);
      const timeText =
        data.timeUntilStart && data.timeUntilStart <= 15
          ? "starting soon"
          : `in ${data.timeUntilStart} minutes`;
      const message = `Upcoming Event: ${data.title} ${timeText}`;

      addNotification({
        type: "calendar_upcoming",
        title: "Upcoming Event",
        message: `${data.title} ${timeText}`,
        data
      });

      toast.info(message, {
        duration: 180000 // 3 minutes
      });
    },
    [addNotification]
  );

  const handleCalendarNew = useCallback(
    (data: CalendarEventData) => {
      console.log("New calendar event:", data);
      const eventDate = data.startTime
        ? new Date(data.startTime).toLocaleDateString()
        : "soon";
      const message = `New Event Added: ${data.title} on ${eventDate}`;

      addNotification({
        type: "calendar_new",
        title: "New Event Added",
        message: `${data.title} on ${eventDate}`,
        data
      });

      toast.info(message, {
        duration: 180000 // 3 minutes
      });
    },
    [addNotification]
  );

  const handleSystemNotification = useCallback(
    (data: SystemNotificationData) => {
      console.log("System notification:", data);
      const message = data.title
        ? `${data.title}: ${data.message}`
        : data.message;

      addNotification({
        type: "system",
        title: data.title || "System Notification",
        message: data.message,
        data
      });

      toast.info(message, {
        duration: 180000 // 3 minutes
      });
    },
    [addNotification]
  );

  const processMessageQueue = useCallback(async () => {
    if (isProcessingRef.current || messageQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;

    while (messageQueueRef.current.length > 0) {
      const data = messageQueueRef.current.shift()!;

      // Display the proactive message directly in the chat interface
      if (updateChatState) {
        console.log("Displaying proactive message:", data.message);
        updateChatState({ message: data.message });

        // Show message for a few seconds, then clear it
        await new Promise(resolve => setTimeout(resolve, 3000));
        updateChatState({ message: "" });
      }

      // Wait before processing next message to allow reading time
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isProcessingRef.current = false;
  }, [updateChatState]);

  const handleChatMessage = useCallback(
    (data: ChatMessageData) => {
      console.log("Proactive chat message:", data);

      if (!auth.isAuthenticated) {
        toast.error(t("auth.loginToContinue"));
        return;
      }

      // Add to queue
      messageQueueRef.current.push(data);
      console.log(
        `Added message to queue. Queue length: ${messageQueueRef.current.length}`
      );

      // Process queue if not already processing
      if (!isProcessingRef.current) {
        processMessageQueue();
      }
    },
    [auth, t, processMessageQueue]
  );

  return {
    handleEmailNotification,
    handleCalendarUpcoming,
    handleCalendarNew,
    handleSystemNotification,
    handleChatMessage,
    processMessageQueue
  };
}
