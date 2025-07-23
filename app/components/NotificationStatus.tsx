import { ConnectionStatus } from "@/lib/types/pusher";
import { useTranslations } from "next-intl";

interface NotificationStatusProps {
  status: ConnectionStatus;
  statusText: string;
}

export default function NotificationStatus({
  status,
  statusText
}: NotificationStatusProps) {
  const t = useTranslations("status");

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500 animate-pulse";
      case "disconnected":
        return "bg-gray-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // Map statusText keys to translations
  const getTranslatedStatusText = (statusText: string): string => {
    const statusMap: Record<string, string> = {
      disconnected: t("disconnected"),
      connecting: t("connecting"),
      connected: t("connected"),
      connectionFailed: t("connectionFailed"),
      connectionError: t("connectionError"),
      subscriptionFailed: t("subscriptionFailed"),
      failedToConnect: t("failedToConnect")
    };

    return statusMap[statusText] || statusText;
  };

  return (
    <div className="flex items-center space-x-2 text-xs">
      <span className="relative flex h-2 w-2">
        <span
          id="eventStatusIndicator"
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${getStatusColor(
            status
          )} opacity-75`}
        />
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${getStatusColor(
            status
          )}`}
        />
      </span>
      <span className="text-gray-400" id="eventStatusText">
        {getTranslatedStatusText(statusText)}
      </span>
    </div>
  );
}
