import { ConnectionStatus } from "@/lib/types/pusher";

interface NotificationStatusProps {
  status: ConnectionStatus;
  statusText: string;
}

export default function NotificationStatus({
  status,
  statusText
}: NotificationStatusProps) {
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
        {statusText}
      </span>
    </div>
  );
}
