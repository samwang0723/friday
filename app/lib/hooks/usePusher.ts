import { agentCoreConfig } from "@/config";
import type {
  ChannelInfo,
  ConnectionStatus,
  PusherConfig,
  PusherEventHandlers
} from "@/lib/types/pusher";
import Pusher, { Channel } from "pusher-js";
import { useCallback, useEffect, useRef, useState } from "react";

interface UsePusherProps {
  isAuthenticated: boolean;
  getToken: () => string | null;
  eventHandlers: PusherEventHandlers;
}

export function usePusher({
  isAuthenticated,
  getToken,
  eventHandlers
}: UsePusherProps) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [statusText, setStatusText] = useState("Disconnected");

  const pusherRef = useRef<Pusher | null>(null);
  const userChannelRef = useRef<Channel | null>(null);
  const connectionRetriesRef = useRef(0);
  const isInitializingRef = useRef(false);

  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000;

  const updateStatus = useCallback(
    (newStatus: ConnectionStatus, text: string) => {
      setStatus(newStatus);
      setStatusText(text);
    },
    []
  );

  const handlePusherError = useCallback(() => {
    if (connectionRetriesRef.current < MAX_RETRIES) {
      connectionRetriesRef.current++;
      console.log(
        `Retrying Pusher connection (${connectionRetriesRef.current}/${MAX_RETRIES})...`
      );
      setTimeout(() => {
        disconnectPusher();
        if (isAuthenticated) {
          initializePusher();
        }
      }, RETRY_DELAY * connectionRetriesRef.current);
    } else {
      console.error("Max Pusher connection retries reached");
      updateStatus("disconnected", "Connection failed");
    }
  }, [isAuthenticated, updateStatus]);

  const disconnectPusher = useCallback(() => {
    if (userChannelRef.current) {
      userChannelRef.current.unbind_all();
      if (pusherRef.current) {
        pusherRef.current.unsubscribe(userChannelRef.current.name);
      }
      userChannelRef.current = null;
    }

    if (pusherRef.current) {
      pusherRef.current.disconnect();
      pusherRef.current = null;
    }

    updateStatus("disconnected", "Disconnected");
    isInitializingRef.current = false;
  }, [updateStatus]);

  const apiCall = useCallback(
    async (endpoint: string) => {
      const token = getToken();
      const fullUrl = `${agentCoreConfig.baseURL}${endpoint}`;
      const response = await fetch(fullUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
      }

      return response;
    },
    [getToken]
  );

  const initializePusher = useCallback(async () => {
    if (!isAuthenticated || pusherRef.current || isInitializingRef.current) {
      return;
    }

    isInitializingRef.current = true;
    console.log("Initializing Pusher connection...");
    updateStatus("connecting", "Connecting...");

    try {
      // Get Pusher configuration from backend
      const configResponse = await apiCall("/events/config");
      const config: PusherConfig = await configResponse.json();
      console.log("Pusher config received:", {
        key: config.key,
        cluster: config.cluster
      });

      // Initialize Pusher
      pusherRef.current = new Pusher(config.key, {
        cluster: config.cluster,
        authEndpoint: `${agentCoreConfig.baseURL}/events/auth`,
        auth: {
          headers: {
            "Content-Type": "application/json"
          }
        }
      });

      // Get user's channel information
      const channelResponse = await apiCall("/events/channel");
      const channelInfo: ChannelInfo = await channelResponse.json();
      console.log("Channel info received:", channelInfo);

      // Subscribe to user's private channel
      userChannelRef.current = pusherRef.current.subscribe(channelInfo.channel);

      // Handle connection events
      pusherRef.current.connection.bind("connected", () => {
        console.log("Pusher connected");
        updateStatus("connected", "Connected");
        connectionRetriesRef.current = 0;
        isInitializingRef.current = false;
      });

      pusherRef.current.connection.bind("disconnected", () => {
        console.log("Pusher disconnected");
        updateStatus("disconnected", "Disconnected");
        isInitializingRef.current = false;
      });

      pusherRef.current.connection.bind("error", (error: Error | unknown) => {
        console.error("Pusher connection error:", error);
        updateStatus("disconnected", "Connection error");
        isInitializingRef.current = false;
        handlePusherError();
      });

      // Handle channel subscription events
      userChannelRef.current.bind("pusher:subscription_succeeded", () => {
        console.log("Successfully subscribed to user channel");
        updateStatus("connected", "Connected");
      });

      userChannelRef.current.bind(
        "pusher:subscription_error",
        (error: Error | unknown) => {
          console.error("Channel subscription error:", error);
          updateStatus("disconnected", "Subscription failed");
          isInitializingRef.current = false;
          handlePusherError();
        }
      );

      // Bind to specific event types
      userChannelRef.current.bind(
        "gmail_important_email",
        eventHandlers.onEmailNotification
      );
      userChannelRef.current.bind(
        "calendar_upcoming_event",
        eventHandlers.onCalendarUpcoming
      );
      userChannelRef.current.bind(
        "calendar_new_event",
        eventHandlers.onCalendarNew
      );
      userChannelRef.current.bind(
        "system_notification",
        eventHandlers.onSystemNotification
      );
      userChannelRef.current.bind("chat_message", eventHandlers.onChatMessage);
    } catch (error) {
      console.error("Failed to initialize Pusher:", error);
      updateStatus("disconnected", "Failed to connect");
      isInitializingRef.current = false;
      handlePusherError();
    }
  }, [
    isAuthenticated,
    getToken,
    eventHandlers,
    updateStatus,
    handlePusherError,
    apiCall
  ]);

  // Initialize Pusher when user is authenticated
  useEffect(() => {
    if (isAuthenticated && !pusherRef.current) {
      initializePusher();
    } else if (!isAuthenticated && pusherRef.current) {
      disconnectPusher();
      connectionRetriesRef.current = 0;
    }
  }, [isAuthenticated, initializePusher, disconnectPusher]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectPusher();
      connectionRetriesRef.current = 0;
    };
  }, [disconnectPusher]);

  return {
    status,
    statusText,
    isConnected: status === "connected",
    disconnect: disconnectPusher,
    reconnect: initializePusher
  };
}
