"use client";

import React from "react";
import type { ChatInterfaceProps } from "@/types/voiceChat";
import ChatForm from "@/components/ChatForm";
import MessageDisplay from "@/components/MessageDisplay";
import VoiceOrb from "@/components/VoiceOrb";
import SettingsButton from "@/components/SettingsButton";

export default function ChatInterface({
  isAuthenticated,
  isSettingsOpen,
  input,
  isPending,
  isStreaming,
  currentMessage,
  messages,
  vadState,
  onInputChange,
  onSubmit,
  inputRef
}: ChatInterfaceProps) {
  return (
    <>
      <div className="pb-4 min-h-28" />

      <ChatForm
        isAuthenticated={isAuthenticated}
        isSettingsOpen={isSettingsOpen}
        input={input}
        isPending={isPending}
        isStreaming={isStreaming}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        inputRef={inputRef}
      />

      <MessageDisplay
        isSettingsOpen={isSettingsOpen}
        authLoading={false}
        isAuthenticated={isAuthenticated}
        currentMessage={currentMessage}
        messages={messages}
        vadState={vadState}
      />

      <VoiceOrb
        isAuthenticated={isAuthenticated}
        isLoading={vadState.loading}
        isErrored={vadState.errored}
        isUserSpeaking={vadState.userSpeaking}
        hasMessage={!!currentMessage}
      />

      <SettingsButton onClick={() => {}} aria-label="Open Settings" />
    </>
  );
}
