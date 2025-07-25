"use client";

import React from "react";
import type { AuthenticatedLayoutProps } from "@/types/voiceChat";
import NotificationStatus from "@/components/NotificationStatus";
import NotificationButton from "@/components/NotificationButton";

export default function AuthenticatedLayout({
  children,
  pusherStatus,
  pusherStatusText,
  onNotificationClick
}: AuthenticatedLayoutProps) {
  return (
    <>
      {children}

      {/* Connected Status - Center Top */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-10">
        <NotificationStatus
          status={pusherStatus}
          statusText={pusherStatusText}
        />
      </div>

      {/* Notification Button - Top Right */}
      <div className="fixed top-4 right-4 z-10">
        <NotificationButton onClick={onNotificationClick} />
      </div>

      {/* Privacy Policy Link and Company Disclaimer */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="flex flex-col items-center space-y-2">
          <a
            href="/privacy"
            className="text-xs text-gray-400 hover:text-gray-300 transition-colors underline"
            aria-label="Privacy Policy"
          >
            Privacy Policy
          </a>
          <p className="text-xs text-gray-500 text-center">
            © 2025 Friday Intelligence Inc. All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
}
