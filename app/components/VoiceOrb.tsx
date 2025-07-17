import clsx from "clsx";

interface VoiceOrbProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  isErrored: boolean;
  isUserSpeaking: boolean;
  hasMessage: boolean;
}

export default function VoiceOrb({
  isAuthenticated,
  isLoading,
  isErrored,
  isUserSpeaking,
  hasMessage
}: VoiceOrbProps) {
  return (
    <div
      className={clsx(
        "absolute size-48 blur-3xl rounded-full bg-linear-to-b from-cyan-200 to-cyan-400 dark:from-cyan-600 dark:to-cyan-800 -z-50 transition ease-in-out",
        {
          "opacity-0": !isAuthenticated || isLoading || isErrored,
          "opacity-30":
            isAuthenticated &&
            !isLoading &&
            !isErrored &&
            !isUserSpeaking &&
            !hasMessage,
          "opacity-100 scale-110":
            isAuthenticated && (isUserSpeaking || hasMessage)
        }
      )}
    />
  );
}