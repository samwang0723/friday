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

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [currentMessage, messages]);

  return (
    <div className={clsx(
      "relative transition-all duration-500",
      {
        "scale-95 -translate-y-2 opacity-40 blur-sm": isSettingsOpen
      }
    )}>
      {/* Fade overlay at top */}
      <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white dark:from-black to-transparent pointer-events-none z-10" />
      
      {/* Scrollable content container */}
      <div
        ref={messageContainerRef}
        className="text-neutral-400 dark:text-neutral-500 pt-4 text-center max-w-lg text-balance h-[9rem] overflow-y-auto scrollbar-hide space-y-4 px-4"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
      {authLoading && <p>{t("auth.checkingAuth")}</p>}

      {!authLoading && !isAuthenticated && <p>{t("auth.pleaseSignIn")}</p>}

      {!authLoading && isAuthenticated && currentMessage && (
        <p>{currentMessage}</p>
      )}

      {!authLoading &&
        isAuthenticated &&
        messages.length > 0 &&
        !currentMessage && (
          <p>
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
            <p>
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
      
      {/* Fade overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white dark:from-black to-transparent pointer-events-none z-10" />
    </div>
  );
}
