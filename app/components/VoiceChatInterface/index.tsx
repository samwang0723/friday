"use client";

import React, { useRef } from "react";
import { startTransition } from "react";
import type { VoiceChatInterfaceProps } from "@/types/voiceChat";
import type { ConnectionStatus } from "@/lib/types/pusher";
import AuthenticatedLayout from "./AuthenticatedLayout";
import ChatInterface from "./ChatInterface";
import GoogleLoginButton from "@/components/GoogleLoginButton";

export default function VoiceChatInterface({
  isAuthenticated,
  authLoading,
  chatState,
  messages,
  vadState,
  settings,
  settingsLoaded,
  onChatSubmit,
  onSettingsChange,
  onLogout,
  onClearHistory
}: VoiceChatInterfaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      return;
    }
    startTransition(() => onChatSubmit(chatState.input));
  };

  if (!isAuthenticated) {
    return (
      <>
        <div className="pb-4 min-h-28" />
        <GoogleLoginButton disabled={authLoading} />
      </>
    );
  }

  return (
    <AuthenticatedLayout
      pusherStatus={"connected" as ConnectionStatus}
      pusherStatusText="Connected"
      onNotificationClick={() => {}}
    >
      <ChatInterface
        isAuthenticated={isAuthenticated}
        isSettingsOpen={false} // This would be managed by parent state
        input={chatState.input}
        isPending={false} // This would come from useVoiceChat
        isStreaming={chatState.isStreaming}
        currentMessage={chatState.message}
        messages={messages}
        vadState={vadState}
        onInputChange={value => {
          // This would update chat state
        }}
        onSubmit={handleFormSubmit}
        inputRef={inputRef}
      />
    </AuthenticatedLayout>
  );
}
