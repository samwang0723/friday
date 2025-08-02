export const serverConfig = {
  port: process.env.PORT || 3000,
  logLevel: process.env.LOG_LEVEL || "info"
};

// Agent-core Configuration
export interface AgentCoreConfig {
  baseURL: string;
  streamTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export const agentCoreConfig: AgentCoreConfig = {
  baseURL:
    process.env.NEXT_PUBLIC_AGENT_CORE_API || "http://localhost:3030/api/v1",
  streamTimeout: parseInt(process.env.AGENT_CORE_STREAM_TIMEOUT || "30000"),
  maxRetries: parseInt(process.env.AGENT_CORE_MAX_RETRIES || "3"),
  retryDelay: parseInt(process.env.AGENT_CORE_RETRY_DELAY || "1000")
};
