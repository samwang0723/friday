"use client";

import React from "react";
import type { NotificationSystemProps } from "@/types/voiceChat";
import NotificationStatus from "@/components/NotificationStatus";
import NotificationButton from "@/components/NotificationButton";

export default function NotificationSystem({
  isAuthenticated,
  pusherStatus,
  pusherStatusText,
  onNotificationClick
}: NotificationSystemProps) {
  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      {/* Connected Status - Center Top */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-10">
        <NotificationStatus
          status={pusherStatus}
          statusText={pusherStatusText}
        />
      </div>

      {/* Notification Button - Top Right */}
      <div className="fixed top-4 right-4 z-10">
        <NotificationButton
          onClick={onNotificationClick}
          aria-label="View Notifications"
        />
      </div>
    </>
  );
}
