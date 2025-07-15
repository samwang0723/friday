/**
 * Authentication Module
 * Handles OAuth authentication with Google using secure practices
 */

// Types and Interfaces
interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  timestamp: number;
  scope?: string;
}

interface AuthConfig {
  agentCoreAPI: string;
  oAuthScopes: string[];
  tokenStorageKey: string;
  stateStorageKey: string;
  stateExpirationMs: number;
  tokenRefreshThresholdMs: number;
}

interface AuthState {
  state: string;
  timestamp: number;
  nonce: string;
}

interface AuthEvents {
  authenticated: { tokenData: TokenData };
  authenticationFailed: { error: AuthError };
  logout: {};
  authStart: {};
  authTimeout: {};
  tokenRefreshed: { tokenData: TokenData };
  message: { message: string; type: "system" | "error" | "info" };
}

// Custom Error Classes
class AuthError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = "AuthError";
  }
}

class TokenError extends AuthError {
  constructor(message: string, details?: unknown) {
    super(message, "TOKEN_ERROR", details);
    this.name = "TokenError";
  }
}

class OAuthError extends AuthError {
  constructor(message: string, details?: unknown) {
    super(message, "OAUTH_ERROR", details);
    this.name = "OAuthError";
  }
}

// Configuration
class AuthConfigManager {
  private static instance: AuthConfigManager;
  private config: AuthConfig;

  private constructor() {
    this.config = {
      agentCoreAPI:
        process.env.NEXT_PUBLIC_AGENT_CORE_API ||
        "http://localhost:3030/api/v1",
      oAuthScopes: process.env.NEXT_PUBLIC_OAUTH_SCOPES
        ? process.env.NEXT_PUBLIC_OAUTH_SCOPES.split(",")
        : [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/calendar"
          ],
      tokenStorageKey: "oauth_token",
      stateStorageKey: "oauth_state",
      stateExpirationMs: 10 * 60 * 1000, // 10 minutes
      tokenRefreshThresholdMs: 5 * 60 * 1000 // 5 minutes before expiry
    };
  }

  static getInstance(): AuthConfigManager {
    if (!AuthConfigManager.instance) {
      AuthConfigManager.instance = new AuthConfigManager();
    }
    return AuthConfigManager.instance;
  }

  getConfig(): AuthConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Storage abstraction for better security
abstract class TokenStorage {
  abstract store(key: string, data: TokenData): Promise<void>;
  abstract retrieve(key: string): Promise<TokenData | null>;
  abstract remove(key: string): Promise<void>;
}

class SecureTokenStorage extends TokenStorage {
  async store(key: string, data: TokenData): Promise<void> {
    try {
      // In production, consider using secure storage like encrypted cookies
      // For now, we'll use sessionStorage which is more secure than localStorage
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      throw new TokenError("Failed to store token", error);
    }
  }

  async retrieve(key: string): Promise<TokenData | null> {
    try {
      const data = sessionStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new TokenError("Failed to retrieve token", error);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      throw new TokenError("Failed to remove token", error);
    }
  }
}

// HTTP client abstraction
class AuthHttpClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      throw new AuthError("HTTP request failed", "HTTP_ERROR", error);
    }
  }
}

// Event emitter with type safety
class TypedEventEmitter<T extends Record<string, any>> {
  private listeners: Map<keyof T, Set<(data: any) => void>> = new Map();

  emit<K extends keyof T>(event: K, data: T[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(data));
    }
  }

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// Main Authentication Module
class AuthModule extends TypedEventEmitter<AuthEvents> {
  private isOAuthInProgress: boolean = false;
  private tokenData: TokenData | null = null;
  private readonly config: AuthConfig;
  private readonly storage: TokenStorage;
  private readonly httpClient: AuthHttpClient;
  private refreshTimeout: NodeJS.Timeout | null = null;

  constructor(
    storage: TokenStorage = new SecureTokenStorage(),
    configManager: AuthConfigManager = AuthConfigManager.getInstance()
  ) {
    super();
    this.config = configManager.getConfig();
    this.storage = storage;
    this.httpClient = new AuthHttpClient(this.config.agentCoreAPI);
  }

  // Public API Methods

  /**
   * Bootstrap authentication - check for existing token or handle OAuth callback
   */
  async bootstrap(): Promise<boolean> {
    try {
      // Check for existing token
      const existingToken = await this.storage.retrieve(
        this.config.tokenStorageKey
      );

      if (existingToken) {
        if (this.isTokenExpired(existingToken)) {
          await this.handleTokenExpiry();
          return false;
        }

        this.tokenData = existingToken;
        this.scheduleTokenRefresh(existingToken);
        this.emit("authenticated", { tokenData: existingToken });
        this.emit("message", {
          message: "Authentication restored",
          type: "system"
        });
        return true;
      }

      // Handle OAuth callback if present
      return await this.handleOAuthCallback();
    } catch (error) {
      const authError =
        error instanceof AuthError
          ? error
          : new AuthError("Bootstrap failed", "BOOTSTRAP_ERROR", error);
      this.emit("authenticationFailed", { error: authError });
      return false;
    }
  }

  /**
   * Initiate Google OAuth login
   */
  async loginWithGoogle(): Promise<void> {
    if (this.isOAuthInProgress) {
      this.emit("message", {
        message: "Authentication already in progress",
        type: "info"
      });
      return;
    }

    try {
      this.isOAuthInProgress = true;
      this.setOAuthTimeout();
      this.emit("authStart", {});

      const state = await this.generateSecureState();
      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      const response = await this.httpClient.post<{ auth_url: string }>(
        "/auth/oauth/initiate",
        {
          redirect_uri: redirectUri,
          state,
          scopes: this.config.oAuthScopes
        }
      );

      if (!response.auth_url) {
        throw new OAuthError("No auth URL received from server");
      }

      this.emit("message", {
        message: "Redirecting to Google...",
        type: "system"
      });
      window.location.href = response.auth_url;
    } catch (error) {
      this.isOAuthInProgress = false;
      const authError =
        error instanceof AuthError
          ? error
          : new OAuthError("OAuth initiation failed", error);
      this.emit("authenticationFailed", { error: authError });
    }
  }

  /**
   * Get the current authentication token
   */
  getToken(): string | null {
    if (this.tokenData && !this.isTokenExpired(this.tokenData)) {
      return this.tokenData.access_token;
    }
    return null;
  }

  /**
   * Clear authentication and logout
   */
  async logout(): Promise<void> {
    try {
      await this.storage.remove(this.config.tokenStorageKey);
      sessionStorage.removeItem(this.config.stateStorageKey);

      if (this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = null;
      }

      this.tokenData = null;
      this.isOAuthInProgress = false;
      this.emit("logout", {});
    } catch (error) {
      throw new AuthError("Logout failed", "LOGOUT_ERROR", error);
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  /**
   * Refresh the current token
   */
  async refreshToken(): Promise<boolean> {
    if (!this.tokenData?.refresh_token) {
      return false;
    }

    try {
      const response = await this.httpClient.post<TokenData>(
        "/auth/oauth/refresh",
        {
          refresh_token: this.tokenData.refresh_token
        }
      );

      response.timestamp = Date.now();
      await this.storage.store(this.config.tokenStorageKey, response);
      this.tokenData = response;
      this.scheduleTokenRefresh(response);
      this.emit("tokenRefreshed", { tokenData: response });
      return true;
    } catch (error) {
      const authError =
        error instanceof AuthError
          ? error
          : new TokenError("Token refresh failed", error);
      this.emit("authenticationFailed", { error: authError });
      return false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    this.removeAllListeners();
  }

  // Private Methods

  private async handleOAuthCallback(): Promise<boolean> {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      const error = urlParams.get("error");

      if (error) {
        throw new OAuthError(`OAuth error: ${error}`);
      }

      if (!code) {
        return false;
      }

      await this.validateOAuthState(state!);
      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      const tokenData = await this.httpClient.post<TokenData>(
        "/auth/oauth/token",
        {
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          state
        }
      );

      if (!tokenData.access_token) {
        throw new TokenError("No access token received");
      }

      tokenData.timestamp = Date.now();
      await this.storage.store(this.config.tokenStorageKey, tokenData);
      this.tokenData = tokenData;
      this.scheduleTokenRefresh(tokenData);

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      this.isOAuthInProgress = false;

      this.emit("authenticated", { tokenData });
      this.emit("message", {
        message: "Authentication successful",
        type: "system"
      });
      return true;
    } catch (error) {
      window.history.replaceState({}, document.title, window.location.pathname);
      this.isOAuthInProgress = false;
      sessionStorage.removeItem(this.config.stateStorageKey);

      const authError =
        error instanceof AuthError
          ? error
          : new OAuthError("OAuth callback failed", error);
      this.emit("authenticationFailed", { error: authError });
      return false;
    }
  }

  private async generateSecureState(): Promise<string> {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();

    const stateData: AuthState = {
      state,
      timestamp: Date.now(),
      nonce
    };

    sessionStorage.setItem(
      this.config.stateStorageKey,
      JSON.stringify(stateData)
    );
    return state;
  }

  private async validateOAuthState(receivedState: string): Promise<void> {
    const storedStateStr = sessionStorage.getItem(this.config.stateStorageKey);
    if (!storedStateStr) {
      throw new OAuthError("No stored OAuth state found");
    }

    let storedStateData: AuthState;
    try {
      storedStateData = JSON.parse(storedStateStr);
    } catch {
      throw new OAuthError("Invalid stored OAuth state format");
    }

    if (storedStateData.state !== receivedState) {
      throw new OAuthError("Invalid OAuth state - possible CSRF attack");
    }

    const stateAge = Date.now() - storedStateData.timestamp;
    if (stateAge > this.config.stateExpirationMs) {
      throw new OAuthError("OAuth state expired");
    }

    sessionStorage.removeItem(this.config.stateStorageKey);
  }

  private isTokenExpired(token: TokenData): boolean {
    if (!token.expires_in || !token.timestamp) {
      return false;
    }

    const expirationTime = token.timestamp + token.expires_in * 1000;
    return Date.now() >= expirationTime;
  }

  private scheduleTokenRefresh(token: TokenData): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    if (!token.expires_in || !token.refresh_token) {
      return;
    }

    const refreshTime =
      token.timestamp +
      token.expires_in * 1000 -
      this.config.tokenRefreshThresholdMs;
    const delay = Math.max(0, refreshTime - Date.now());

    this.refreshTimeout = setTimeout(() => {
      this.refreshToken();
    }, delay);
  }

  private async handleTokenExpiry(): Promise<void> {
    this.emit("message", { message: "Token expired", type: "system" });
    await this.logout();
  }

  private setOAuthTimeout(): void {
    setTimeout(() => {
      if (this.isOAuthInProgress) {
        this.isOAuthInProgress = false;
        this.emit("authTimeout", {});
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
}

// Singleton instance
let authModuleInstance: AuthModule | null = null;

export const getAuthModule = (): AuthModule => {
  if (!authModuleInstance) {
    authModuleInstance = new AuthModule();
  }
  return authModuleInstance;
};

// Export for testing
export {
  AuthModule,
  AuthError,
  TokenError,
  OAuthError,
  SecureTokenStorage,
  AuthConfigManager
};
export type { TokenData, AuthConfig, AuthEvents };

// Default export for backward compatibility
export default getAuthModule();
