"use client";

import clsx from "clsx";
import React, {
  useActionState,
  useEffect,
  useRef,
  useState,
  startTransition
} from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { EnterIcon, LoadingIcon } from "@/lib/icons";
import { usePlayer } from "@/lib/usePlayer";
import { track } from "@vercel/analytics";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import authModule from "@/lib/auth";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import Settings, { SettingsState } from "@/components/Settings";
import { AgentCoreService } from "@/lib/agentCore";

type Message = {
  role: "user" | "assistant";
  content: string;
  latency?: number;
};

export default function Home() {
  const t = useTranslations();
  const [input, setInput] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [agentCoreInitialized, setAgentCoreInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<SettingsState>({
    sttEngine: "groq",
    ttsEngine: "elevenlabs",
    streaming: false
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const player = usePlayer();
  const agentCoreRef = useRef<AgentCoreService | null>(null);

  // Track current request for cancellation
  const currentRequestRef = useRef<AbortController | null>(null);

  // Initialize Agent Core service
  useEffect(() => {
    if (!agentCoreRef.current) {
      agentCoreRef.current = new AgentCoreService();
    }
  }, []);

  const vad = useMicVAD({
    startOnLoad: isAuthenticated, // Only start VAD if authenticated
    onSpeechEnd: (audio) => {
      if (!isAuthenticated) return; // Guard against usage when not authenticated
      player.stop();
      const wav = utils.encodeWAV(audio);
      const blob = new Blob([wav], { type: "audio/wav" });
      startTransition(() => submit(blob));
      const isFirefox = navigator.userAgent.includes("Firefox");
      if (isFirefox) vad.pause();
    },
    positiveSpeechThreshold: 0.6,
    minSpeechFrames: 4
  });

  // Bootstrap authentication on component mount (runs only once)
  useEffect(() => {
    const bootstrapAuth = async () => {
      setAuthLoading(true);
      try {
        const authenticated = await authModule.bootstrap();
        setIsAuthenticated(authenticated);
      } catch (error) {
        console.error("Authentication bootstrap failed:", error);
        setIsAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };

    bootstrapAuth();

    // Listen for authentication events
    const handleAuthenticated = () => {
      setIsAuthenticated(true);
    };

    const handleLogout = () => {
      setIsAuthenticated(false);
      setAgentCoreInitialized(false);
      // Cancel any ongoing request when logging out
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
        currentRequestRef.current = null;
      }
    };

    authModule.on("authenticated", handleAuthenticated);
    authModule.on("logout", handleLogout);

    return () => {
      authModule.off("authenticated", handleAuthenticated);
      authModule.off("logout", handleLogout);
    };
  }, []); // Empty dependency array - runs only once on mount

  // Initialize Agent Core chat session after authentication
  useEffect(() => {
    const initAgentCore = async () => {
      if (isAuthenticated && !agentCoreInitialized && agentCoreRef.current) {
        try {
          const accessToken = authModule.getToken();
          if (accessToken) {
            await agentCoreRef.current.initChat(accessToken, {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              clientDatetime: new Date().toISOString()
            });
            setAgentCoreInitialized(true);
            console.log("Agent Core chat session initialized");
          }
        } catch (error) {
          console.error("Failed to initialize Agent Core:", error);
          toast.error("Failed to initialize chat session");
        }
      }
    };

    initAgentCore();
  }, [isAuthenticated, agentCoreInitialized]);

  // Separate effect to handle VAD state changes based on authentication
  useEffect(() => {
    if (isAuthenticated && vad && !vad.loading && !vad.errored) {
      vad.start();
    } else if (!isAuthenticated && vad) {
      vad.pause();
    }
  }, [isAuthenticated, vad]);

  useEffect(() => {
    function keyDown(e: KeyboardEvent) {
      if (!isAuthenticated) return; // Don't handle keyboard events if not authenticated
      if (e.key === "Enter") return inputRef.current?.focus();
      if (e.key === "Escape") return setInput("");
    }

    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [isAuthenticated]);

  const [messages, submit, isPending] = useActionState<
    Array<Message>,
    string | Blob
  >(async (prevMessages, data) => {
    if (!isAuthenticated) {
      toast.error(t("auth.loginToContinue"));
      return prevMessages;
    }

    // Cancel any previous request
    if (currentRequestRef.current) {
      console.log("Cancelling previous request");
      currentRequestRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    currentRequestRef.current = abortController;

    const formData = new FormData();

    if (typeof data === "string") {
      formData.append("input", data);
      track("Text input");
    } else {
      formData.append("input", data, "audio.wav");
      track("Speech input");
    }

    for (const message of prevMessages) {
      formData.append("message", JSON.stringify(message));
    }

    // Add settings to the form data
    formData.append("settings", JSON.stringify(appSettings));

    const submittedAt = Date.now();

    // Get the access token for Bearer authorization
    const accessToken = authModule.getToken();
    const headers: HeadersInit = {};

    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    try {
      const response = await fetch("/api", {
        method: "POST",
        headers,
        body: formData,
        signal: abortController.signal
      });

      // Check if request was cancelled
      if (abortController.signal.aborted) {
        console.log("Request was cancelled on client side");
        return prevMessages;
      }

      const transcript = decodeURIComponent(
        response.headers.get("X-Transcript") || ""
      );
      const text = decodeURIComponent(response.headers.get("X-Response") || "");

      if (!response.ok || !transcript || !text || !response.body) {
        if (response.status === 401) {
          // Handle unauthorized - clear auth state and trigger re-authentication
          try {
            await authModule.logout();
            toast.error("Session expired. Please sign in again.");
          } catch (error) {
            console.error("Failed to logout:", error);
            toast.error("Authentication error. Please refresh the page.");
          }
        } else if (response.status === 429) {
          toast.error(t("errors.tooManyRequests"));
        } else {
          toast.error((await response.text()) || t("common.error"));
        }

        return prevMessages;
      }

      // Clear the current request reference since it completed successfully
      currentRequestRef.current = null;

      const latency = Date.now() - submittedAt;

      // Use streaming or non-streaming playback based on settings
      if (appSettings.streaming) {
        player.playStream(response.body, () => {
          const isFirefox = navigator.userAgent.includes("Firefox");
          if (isFirefox) vad.start();
        });
      } else {
        player.play(response.body, () => {
          const isFirefox = navigator.userAgent.includes("Firefox");
          if (isFirefox) vad.start();
        });
      }

      setInput(transcript);

      return [
        ...prevMessages,
        {
          role: "user",
          content: transcript
        },
        {
          role: "assistant",
          content: text,
          latency
        }
      ];
    } catch (error) {
      // Clear the current request reference
      currentRequestRef.current = null;

      // Handle AbortError specifically (when request was cancelled)
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Request was cancelled");
        return prevMessages;
      }

      console.error("Request failed:", error);
      toast.error("Request failed. Please try again.");
      return prevMessages;
    }
  }, []);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error(t("auth.loginToContinue"));
      return;
    }
    startTransition(() => submit(input));
  }

  const handleLogout = async () => {
    try {
      await authModule.logout();
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("Failed to logout:", error);
      toast.error("Failed to sign out. Please try again.");
    }
  };

  const handleSettingsChange = (settings: SettingsState) => {
    setAppSettings(settings);
    console.log("Settings updated:", settings);
  };

  return (
    <>
      <div className="pb-4 min-h-28" />

      {!isAuthenticated && <GoogleLoginButton disabled={authLoading} />}

      <form
        className={clsx(
          "rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 flex items-center w-full max-w-3xl border border-transparent transition-all duration-500",
          {
            "hover:drop-shadow-lg hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.3)] focus-within:drop-shadow-xl focus-within:drop-shadow-[0_0_25px_rgba(34,211,238,0.4)] focus-within:ring-2 focus-within:ring-cyan-500/30 dark:hover:drop-shadow-[0_0_15px_rgba(34,211,238,0.4)] dark:focus-within:drop-shadow-[0_0_25px_rgba(34,211,238,0.5)] dark:focus-within:ring-cyan-400/30":
              isAuthenticated,
            "opacity-50 cursor-not-allowed": !isAuthenticated,
            "opacity-40 blur-sm pointer-events-none": isSettingsOpen
          }
        )}
        onSubmit={handleFormSubmit}
      >
        <input
          type="text"
          className="bg-transparent focus:outline-hidden pl-6 pr-4 py-4 w-full placeholder:text-neutral-600 dark:placeholder:text-neutral-400 disabled:cursor-not-allowed"
          required
          placeholder={
            isAuthenticated
              ? t("assistant.placeholder")
              : t("auth.loginToContinue")
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          ref={inputRef}
          disabled={!isAuthenticated}
        />

        <button
          type="submit"
          className="p-4 mr-1 text-neutral-700 hover:text-black dark:text-neutral-300 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isPending || !isAuthenticated}
          aria-label="Submit"
        >
          {isPending ? <LoadingIcon /> : <EnterIcon />}
        </button>
      </form>

      <div
        className={clsx(
          "text-neutral-400 dark:text-neutral-600 pt-4 text-center max-w-xl text-balance min-h-28 space-y-4 transition-all duration-500",
          {
            "scale-95 -translate-y-2 opacity-40 blur-sm": isSettingsOpen
          }
        )}
      >
        {authLoading && <p>{t("auth.checkingAuth")}</p>}

        {!authLoading && !isAuthenticated && <p>{t("auth.pleaseSignIn")}</p>}

        {!authLoading && isAuthenticated && messages.length > 0 && (
          <p>
            {messages.at(-1)?.content}
            <span className="text-xs font-mono text-neutral-300 dark:text-neutral-700">
              {" "}
              ({messages.at(-1)?.latency}ms)
            </span>
          </p>
        )}

        {!authLoading && isAuthenticated && messages.length === 0 && (
          <>
            <p>
              A fast, open-source voice assistant powered by{" "}
              <A href="https://groq.com">Groq</A>,{" "}
              <A href="https://cartesia.ai">Cartesia</A>,{" "}
              <A href="https://www.vad.ricky0123.com/">VAD</A>, and{" "}
              <A href="https://vercel.com">Vercel</A>.{" "}
              <A href="https://github.com/samwang0723/friday" target="_blank">
                Learn more
              </A>
              .
            </p>

            {vad.loading ? (
              <p>{t("assistant.loadingSpeech")}</p>
            ) : vad.errored ? (
              <p>{t("assistant.speechDetectionFailed")}</p>
            ) : (
              <p>{t("assistant.startTalking")}</p>
            )}
          </>
        )}
      </div>

      <div
        className={clsx(
          "absolute size-48 blur-3xl rounded-full bg-linear-to-b from-cyan-200 to-cyan-400 dark:from-cyan-600 dark:to-cyan-800 -z-50 transition ease-in-out",
          {
            "opacity-0": !isAuthenticated || vad.loading || vad.errored,
            "opacity-30":
              isAuthenticated &&
              !vad.loading &&
              !vad.errored &&
              !vad.userSpeaking,
            "opacity-100 scale-110": isAuthenticated && vad.userSpeaking
          }
        )}
      />

      {/* Settings Button */}
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="fixed bottom-6 right-6 p-3 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 backdrop-blur-md hover:bg-neutral-300/80 dark:hover:bg-neutral-700/80 transition-colors shadow-lg z-50"
        aria-label="Settings"
      >
        <svg
          className="h-6 w-6 text-neutral-700 dark:text-neutral-300"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Settings Component */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
        isAuthenticated={isAuthenticated}
        onSettingsChange={handleSettingsChange}
      />
    </>
  );
}

function A(props: any) {
  return (
    <a
      {...props}
      className="text-neutral-500 dark:text-neutral-500 hover:underline font-medium"
    />
  );
}
