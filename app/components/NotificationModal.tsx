"use client";

import { CloseIcon } from "@/components/Icons";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useNotifications,
  type Notification
} from "@/lib/hooks/useNotifications";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function NotificationItem({ notification }: { notification: Notification }) {
  const { markAsRead } = useNotifications();
  const t = useTranslations();

  const handleClick = () => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  const getNotificationIcon = (type: Notification["type"]) => {
    const iconClass = "h-6 w-6 text-gray-400";

    switch (type) {
      case "email":
        return (
          <svg
            className={iconClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M3 8l7.89 7.89a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        );
      case "calendar_upcoming":
        return (
          <svg
            className={iconClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "calendar_new":
        return (
          <svg
            className={iconClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        );
      case "system":
        return (
          <svg
            className={iconClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "chat":
        return (
          <svg
            className={iconClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        );
      default:
        return (
          <svg
            className={iconClass}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M15 17h5l-5 5v-5zM4 12a8 8 0 018-8V3a1 1 0 112 0v1a8 8 0 018 8c0 7-3 9-9 9s-9-2-9-9zM8.21 21c.65.5 1.45.5 2.79.5s2.14 0 2.79-.5"
            />
          </svg>
        );
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t("notifications.timeAgo.justNow");
    if (minutes < 60) return t("notifications.timeAgo.minutesAgo", { minutes });
    if (hours < 24) return t("notifications.timeAgo.hoursAgo", { hours });
    if (days < 7) return t("notifications.timeAgo.daysAgo", { days });
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
        <div className="mt-1">{getNotificationIcon(notification.type)}</div>
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

export default function NotificationModal({
  isOpen,
  onClose
}: NotificationModalProps) {
  const t = useTranslations();
  const auth = useAuth();
  const { notifications, unreadCount, markAllAsRead, clearAll } =
    useNotifications();

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Desktop Modal */}
        <div className="hidden md:flex items-center justify-center min-h-screen p-4">
          <div className="bg-[#09051a] text-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center space-x-3">
                <h1 className="pl-3 text-lg font-bold">
                  {t("notifications.title")}
                </h1>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                    aria-label={t("notifications.markAllAsRead")}
                  >
                    <svg
                      className="h-5 w-5 text-gray-400 hover:text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                    aria-label={t("notifications.clearAll")}
                  >
                    <svg
                      className="h-5 w-5 text-gray-400 hover:text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                        d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                      />
                    </svg>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                  aria-label={t("notifications.close")}
                >
                  <CloseIcon className="h-5 w-5 text-gray-400 hover:text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto rounded-b-lg">
              <div className="bg-gray-900 rounded-b-lg">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <h2 className="text-xl font-semibold mb-2">
                      {t("notifications.empty.title")}
                    </h2>
                    <p className="text-gray-400">
                      {t("notifications.empty.message")}
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
        </div>

        {/* Mobile Modal - Full Screen */}
        <div className="md:hidden h-full">
          <div className="bg-[#09051a] text-white h-full flex flex-col">
            {/* Header */}
            <div className="sticky top-0 bg-[#09051a] border-b border-gray-800 z-10">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <h1 className="pl-3 text-lg font-bold">
                      {t("notifications.title")}
                    </h1>
                    {unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 flex-shrink-0">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                        aria-label={t("notifications.markAllAsRead")}
                      >
                        <svg
                          className="h-5 w-5 text-gray-400 hover:text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAll}
                        className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                        aria-label={t("notifications.clearAll")}
                      >
                        <svg
                          className="h-5 w-5 text-gray-400 hover:text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-gray-800/50 rounded transition-colors"
                      aria-label={t("notifications.close")}
                    >
                      <CloseIcon className="h-5 w-5 text-gray-400 hover:text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pt-6">
              <div className="bg-gray-900 rounded-lg overflow-hidden">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <h2 className="text-xl font-semibold mb-2">
                      {t("notifications.empty.title")}
                    </h2>
                    <p className="text-gray-400">
                      {t("notifications.empty.message")}
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
        </div>
      </div>
    </>
  );
}
