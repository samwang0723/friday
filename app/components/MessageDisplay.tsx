import Link from "./Link";
import clsx from "clsx";
import { useTranslations } from "next-intl";

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

  return (
    <div
      className={clsx(
        "text-neutral-400 dark:text-neutral-600 pt-4 text-center max-w-xl text-balance min-h-28 space-y-4 transition-all duration-500",
        {
          "scale-95 -translate-y-2 opacity-40 blur-sm": isSettingsOpen
        }
      )}
    >
      {authLoading && <p>{t("auth.checkingAuth")}</p>}

      {!authLoading && !isAuthenticated && (
        <p>{t("auth.pleaseSignIn")}</p>
      )}

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
              {t("assistant.description", {
                groq: <Link href="https://groq.com">Groq</Link>,
                cartesia: <Link href="https://cartesia.ai">Cartesia</Link>,
                vad: <Link href="https://www.vad.ricky0123.com/">VAD</Link>,
                vercel: <Link href="https://vercel.com">Vercel</Link>,
                learnMore: <Link href="https://github.com/samwang0723/friday" target="_blank">{t("assistant.learnMore")}</Link>
              })}
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
  );
}