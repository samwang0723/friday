export interface PusherConfig {
  key: string;
  cluster: string;
}

export interface ChannelInfo {
  channel: string;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface NotificationOptions {
  type: "email" | "calendar" | "system" | "chat";
  title: string;
  content: string;
  priority: "low" | "medium" | "high" | "urgent";
  timestamp: Date;
}

export interface EmailNotificationData {
  subject: string;
  fromAddress: string;
  priority: "low" | "medium" | "high" | "urgent";
  timestamp: string;
}

export interface CalendarEventData {
  title: string;
  timeUntilStart?: number;
  startTime?: string;
  priority: "low" | "medium" | "high" | "urgent";
  timestamp: string;
}

export interface SystemNotificationData {
  title?: string;
  message: string;
  timestamp: string;
}

export interface ChatMessageData {
  message: string;
  timestamp: string;
}

export interface PusherEventHandlers {
  onEmailNotification: (data: EmailNotificationData) => void;
  onCalendarUpcoming: (data: CalendarEventData) => void;
  onCalendarNew: (data: CalendarEventData) => void;
  onSystemNotification: (data: SystemNotificationData) => void;
  onChatMessage: (data: ChatMessageData) => void;
}
