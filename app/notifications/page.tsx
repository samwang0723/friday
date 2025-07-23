"use client";

import { CloseIcon } from "@/components/Icons";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useNotifications,
  type Notification
} from "@/lib/hooks/useNotifications";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
      <div className="sticky top-0 bg-[#09051a] border-b border-gray-800 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link
                href="/"
                className="p-3 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 backdrop-blur-md hover:bg-neutral-300/80 dark:hover:bg-neutral-700/80 transition-colors shadow-lg flex-shrink-0"
                aria-label="Go back"
              >
                <CloseIcon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              </Link>
              <h1 className="text-xl sm:text-xl font-bold">Notifications</h1>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 flex-shrink-0">
                  {unreadCount}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                  aria-label="Mark all as read"
                >
                  <svg
                    className="h-5 w-5 text-gray-400 hover:text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                  aria-label="Clear all notifications"
                >
                  <svg
                    className="h-5 w-5 text-gray-400 hover:text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto pt-6">
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
