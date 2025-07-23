"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/Icons";
import {
  useNotifications,
  type Notification
} from "@/lib/hooks/useNotifications";
import { useAuth } from "@/lib/hooks/useAuth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

function NotificationItem({ notification }: { notification: Notification }) {
  const { markAsRead } = useNotifications();

  const handleClick = () => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    switch (type) {
      case "email":
        return "📧";
      case "calendar_upcoming":
        return "⏰";
      case "calendar_new":
        return "📅";
      case "system":
        return "ℹ️";
      case "chat":
        return "💬";
      default:
        return "🔔";
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  return (
    <div
      className={`p-4 border-b border-gray-700 cursor-pointer hover:bg-gray-800/50 transition-colors ${
        !notification.read ? "bg-blue-900/20 border-l-4 border-l-blue-500" : ""
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start space-x-3">
        <span className="text-2xl mt-1">
          {getNotificationIcon(notification.type)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3
              className={`font-semibold ${!notification.read ? "text-white" : "text-gray-300"}`}
            >
              {notification.title}
            </h3>
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {formatTimestamp(notification.timestamp)}
            </span>
          </div>
          <p
            className={`mt-1 text-sm ${!notification.read ? "text-gray-200" : "text-gray-400"}`}
          >
            {notification.message}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const t = useTranslations();
  const auth = useAuth();
  const router = useRouter();
  const { notifications, unreadCount, markAllAsRead, clearAll } =
    useNotifications();

  useEffect(() => {
    if (!auth.isAuthenticated && !auth.loading) {
      router.push("/");
    }
  }, [auth.isAuthenticated, auth.loading, router]);

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#09051a] text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-gray-400 mb-4">
            Please sign in to view your notifications.
          </p>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09051a] text-white">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="p-2 rounded-full hover:bg-gray-800 transition-colors"
              aria-label="Go back"
            >
              <CloseIcon />
            </Link>
            <h1 className="text-3xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-sm rounded-full px-2 py-1">
                {unreadCount} unread
              </span>
            )}
          </div>

          <div className="flex space-x-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
              >
                Mark All Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg overflow-hidden">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-6xl mb-4">🔔</div>
              <h2 className="text-xl font-semibold mb-2">
                No notifications yet
              </h2>
              <p className="text-gray-400">
                When you receive notifications, they'll appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {notifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
