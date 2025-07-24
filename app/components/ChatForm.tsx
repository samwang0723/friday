import { EnterIcon, LoadingIcon } from "@/components/Icons";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import React from "react";

interface ChatFormProps {
  isAuthenticated: boolean;
  isSettingsOpen: boolean;
  input: string;
  isPending: boolean;
  isStreaming: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export default function ChatForm({
  isAuthenticated,
  isSettingsOpen,
  input,
  isPending,
  isStreaming,
  onInputChange,
  onSubmit,
  inputRef
}: ChatFormProps) {
  const t = useTranslations();

  return (
    <form
      className={clsx(
        "rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 flex items-center w-full max-w-3xl border border-transparent transition-all duration-500",
        {
          // Mobile: Simple border effects only
          "focus-within:border-cyan-500 dark:focus-within:border-cyan-400 md:focus-within:border-transparent":
            isAuthenticated,
          // Desktop: Full gradient effects (overrides mobile border)
          "md:hover:drop-shadow-lg md:hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.3)] md:focus-within:drop-shadow-xl md:focus-within:drop-shadow-[0_0_25px_rgba(34,211,238,0.4)] md:focus-within:ring-2 md:focus-within:ring-cyan-500/30 md:dark:hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.4)] md:dark:focus-within:drop-shadow-[0_0_25px_rgba(34,211,238,0.5)] md:dark:focus-within:ring-cyan-400/30":
            isAuthenticated,
          "opacity-50 cursor-not-allowed": !isAuthenticated,
          "opacity-40 blur-sm pointer-events-none": isSettingsOpen
        }
      )}
      onSubmit={onSubmit}
    >
      <input
        id="chat-input"
        name="chatInput"
        type="text"
        autoComplete="off"
        className="bg-transparent focus:outline-none focus:ring-0 focus:border-transparent pl-6 pr-4 py-4 w-full placeholder:text-neutral-600 dark:placeholder:text-neutral-400 disabled:cursor-not-allowed appearance-none border-none"
        style={{
          WebkitAppearance: "none",
          appearance: "none",
          WebkitTapHighlightColor: "transparent",
          outline: "none",
          border: "none",
          boxShadow: "none",
          background: "transparent !important",
          backgroundColor: "transparent !important",
          WebkitBoxShadow: "none",
          MozBoxShadow: "none",
          WebkitTextFillColor: "inherit",
          transition: "background-color 5000s ease-in-out 0s"
        }}
        required
        placeholder={
          isAuthenticated
            ? t("assistant.placeholder")
            : t("auth.loginToContinue")
        }
        value={input}
        onChange={e => onInputChange(e.target.value)}
        ref={inputRef}
        disabled={!isAuthenticated}
      />

      <button
        type="submit"
        className="p-4 mr-1 text-neutral-700 hover:text-black dark:text-neutral-300 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        disabled={isPending || !isAuthenticated || isStreaming}
        aria-label="Submit"
      >
        {isPending || isStreaming ? <LoadingIcon /> : <EnterIcon />}
      </button>
    </form>
  );
}
