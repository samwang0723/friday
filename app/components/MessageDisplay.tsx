import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import Link from "./Link";

type Message = {
  role: "user" | "assistant";
  content: string;
  latency?: number;
};

interface VADState {
  loading: boolean;
  errored: boolean;
}

interface MessageDisplayProps {
  isSettingsOpen: boolean;
  authLoading: boolean;
  isAuthenticated: boolean;
  currentMessage: string;
  messages: Message[];
  vadState: VADState;
}

export default function MessageDisplay({
  isSettingsOpen,
  authLoading,
  isAuthenticated,
  currentMessage,
  messages,
  vadState
}: MessageDisplayProps) {
  const t = useTranslations();
  const locale = useLocale();

  const messageContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when content changes with smooth animation
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [currentMessage, messages]);

  return (
    <div
      className={clsx("relative transition-all duration-500 pt-2", {
        "scale-95 -translate-y-2 opacity-40 blur-sm": isSettingsOpen
      })}
    >
      {/* Scrollable content container */}
      <div
        ref={messageContainerRef}
        className="text-neutral-400 dark:text-neutral-500 pt-4 text-center max-w-xl text-balance h-[12rem] overflow-y-auto scrollbar-hide space-y-4 px-4"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)"
        }}
      >
        {authLoading && <p className="pb-2 pt-2">{t("auth.checkingAuth")}</p>}

        {!authLoading && !isAuthenticated && (
          <p className="pb-2 pt-2">{t("auth.pleaseSignIn")}</p>
        )}

        {!authLoading && isAuthenticated && currentMessage && (
          <p className="pb-4 pt-2">{currentMessage}</p>
        )}

        {!authLoading &&
          isAuthenticated &&
          messages.length > 0 &&
          !currentMessage && (
            <p className="pb-4 pt-2">
              {messages.at(-1)?.content}
              <span className="text-xs font-mono text-neutral-300 dark:text-neutral-700">
                {" "}
                ({messages.at(-1)?.latency}ms)
              </span>
            </p>
          )}

        {!authLoading &&
          isAuthenticated &&
          messages.length === 0 &&
          !currentMessage && (
            <>
              <p className="pb-2 pt-2">
                {locale === "zh" || locale === "zh-TW" ? (
                  <>
                    {t("assistant.description")}{" "}
                    <Link href="https://groq.com">Groq</Link>、{" "}
                    <Link href="https://cartesia.ai">Cartesia</Link>、{" "}
                    <Link href="https://www.vad.ricky0123.com/">VAD</Link> 和{" "}
                    <Link href="https://vercel.com">Vercel</Link>{" "}
                    驱动的快速开源语音助手。{" "}
                    <Link
                      href="https://github.com/samwang0723/friday"
                      target="_blank"
                    >
                      {t("assistant.learnMore")}
                    </Link>
                    。
                  </>
                ) : locale === "ja" ? (
                  <>
                    <Link href="https://groq.com">Groq</Link>、{" "}
                    <Link href="https://cartesia.ai">Cartesia</Link>、{" "}
                    <Link href="https://www.vad.ricky0123.com/">VAD</Link>、{" "}
                    <Link href="https://vercel.com">Vercel</Link>{" "}
                    によって駆動される{t("assistant.description")}{" "}
                    <Link
                      href="https://github.com/samwang0723/friday"
                      target="_blank"
                    >
                      {t("assistant.learnMore")}
                    </Link>
                    。
                  </>
                ) : locale === "ko" ? (
                  <>
                    <Link href="https://groq.com">Groq</Link>、{" "}
                    <Link href="https://cartesia.ai">Cartesia</Link>、{" "}
                    <Link href="https://www.vad.ricky0123.com/">VAD</Link>、{" "}
                    <Link href="https://vercel.com">Vercel</Link> 로 구동되는{" "}
                    {t("assistant.description")}{" "}
                    <Link
                      href="https://github.com/samwang0723/friday"
                      target="_blank"
                    >
                      {t("assistant.learnMore")}
                    </Link>
                    .
                  </>
                ) : locale === "es" ? (
                  <>
                    {t("assistant.description")}{" "}
                    <Link href="https://groq.com">Groq</Link>,{" "}
                    <Link href="https://cartesia.ai">Cartesia</Link>,{" "}
                    <Link href="https://www.vad.ricky0123.com/">VAD</Link> y{" "}
                    <Link href="https://vercel.com">Vercel</Link>.{" "}
                    <Link
                      href="https://github.com/samwang0723/friday"
                      target="_blank"
                    >
                      {t("assistant.learnMore")}
                    </Link>
                    .
                  </>
                ) : locale === "fr" ? (
                  <>
                    {t("assistant.description")}{" "}
                    <Link href="https://groq.com">Groq</Link>,{" "}
                    <Link href="https://cartesia.ai">Cartesia</Link>,{" "}
                    <Link href="https://www.vad.ricky0123.com/">VAD</Link> et{" "}
                    <Link href="https://vercel.com">Vercel</Link>.{" "}
                    <Link
                      href="https://github.com/samwang0723/friday"
                      target="_blank"
                    >
                      {t("assistant.learnMore")}
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    {t("assistant.description")}{" "}
                    <Link href="https://groq.com">Groq</Link>,{" "}
                    <Link href="https://cartesia.ai">Cartesia</Link>,{" "}
                    <Link href="https://www.vad.ricky0123.com/">VAD</Link>, and{" "}
                    <Link href="https://vercel.com">Vercel</Link>.{" "}
                    <Link
                      href="https://github.com/samwang0723/friday"
                      target="_blank"
                    >
                      {t("assistant.learnMore")}
                    </Link>
                    .
                  </>
                )}
              </p>

              {vadState.loading ? (
                <p>{t("assistant.loadingSpeech")}</p>
              ) : vadState.errored ? (
                <p>{t("assistant.speechDetectionFailed")}</p>
              ) : (
                <p>{t("assistant.startTalking")}</p>
              )}
            </>
          )}
      </div>
    </div>
  );
}
