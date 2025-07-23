"use client";

import Link from "next/link";
import { BellIcon } from "./Icons";
import { useNotifications } from "@/lib/hooks/useNotifications";

export default function NotificationButton() {
  const { unreadCount } = useNotifications();

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center justify-center p-3 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 backdrop-blur-md hover:bg-neutral-300/80 dark:hover:bg-neutral-700/80 transition-colors shadow-lg"
      aria-label="View notifications"
    >
      <BellIcon />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
