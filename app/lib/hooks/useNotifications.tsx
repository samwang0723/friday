"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useReducer
} from "react";
import type {
  CalendarEventData,
  ChatMessageData,
  EmailNotificationData,
  SystemNotificationData
} from "@/lib/types/pusher";

export interface Notification {
  id: string;
  type: "email" | "calendar_upcoming" | "calendar_new" | "system" | "chat";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?:
    | EmailNotificationData
    | CalendarEventData
    | SystemNotificationData
    | ChatMessageData;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
}

type NotificationAction =
  | { type: "ADD_NOTIFICATION"; payload: Notification }
  | { type: "MARK_READ"; payload: string }
  | { type: "MARK_ALL_READ" }
  | { type: "CLEAR_ALL" };

const notificationReducer = (
  state: NotificationState,
  action: NotificationAction
): NotificationState => {
  switch (action.type) {
    case "ADD_NOTIFICATION":
      const newNotifications = [action.payload, ...state.notifications];
      return {
        notifications: newNotifications,
        unreadCount: newNotifications.filter(n => !n.read).length
      };

    case "MARK_READ":
      const updatedNotifications = state.notifications.map(n =>
        n.id === action.payload ? { ...n, read: true } : n
      );
      return {
        notifications: updatedNotifications,
        unreadCount: updatedNotifications.filter(n => !n.read).length
      };

    case "MARK_ALL_READ":
      const allReadNotifications = state.notifications.map(n => ({
        ...n,
        read: true
      }));
      return {
        notifications: allReadNotifications,
        unreadCount: 0
      };

    case "CLEAR_ALL":
      return {
        notifications: [],
        unreadCount: 0
      };

    default:
      return state;
  }
};

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp" | "read">
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within NotificationProvider"
    );
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children
}) => {
  const [state, dispatch] = useReducer(notificationReducer, {
    notifications: [],
    unreadCount: 0
  });

  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
      const newNotification: Notification = {
        ...notification,
        id: crypto.randomUUID(),
        timestamp: new Date(),
        read: false
      };
      dispatch({ type: "ADD_NOTIFICATION", payload: newNotification });
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    dispatch({ type: "MARK_READ", payload: id });
  }, []);

  const markAllAsRead = useCallback(() => {
    dispatch({ type: "MARK_ALL_READ" });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  const value = useMemo(
    () => ({
      notifications: state.notifications,
      unreadCount: state.unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll
    }),
    [
      state.notifications,
      state.unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
