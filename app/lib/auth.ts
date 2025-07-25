/**
 * Simplified Authentication Module
 * Handles OAuth authentication with Google using simple functions
 */

interface UserData {
  access_token: string;
  user_id: string;
  user_info: {
    email: string;
    name: string;
    picture: string;
  };
}

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  token: string | null;
}

// Simple auth state management
let authState: AuthState = {
  isAuthenticated: false,
  loading: false,
  token: null
};

// Event listeners for auth state changes
const authListeners = new Set<(state: AuthState) => void>();

const config = {
  agentCoreAPI:
    process.env.NEXT_PUBLIC_AGENT_CORE_API || "http://localhost:3030/api/v1",
  oAuthScopes: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.events"
  ],
  // Remove hardcoded domain - let browser handle it automatically
  cookieDomain: undefined // Will work for current domain
};

// Cookie utilities
const cookieUtils = {
  set: (name: string, value: string, days: number = 7, domain?: string) => {
    const maxAge = days * 24 * 60 * 60; // Convert days to seconds

    let cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; path=/; SameSite=Lax`;

    // Only set Secure flag if we're on HTTPS (not localhost)
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:"
    ) {
      cookie += "; Secure";
    }

    // Only set domain if explicitly provided and not localhost
    if (domain && !window.location.hostname.includes("localhost")) {
      cookie += `; domain=${domain}`;
    }

    document.cookie = cookie;
  },

  get: (name: string): string | null => {
    if (typeof document === "undefined") return null;

    const nameEQ = name + "=";
    const ca = document.cookie.split(";");

    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        return decodeURIComponent(c.substring(nameEQ.length, c.length));
      }
    }
    return null;
  },

  delete: (name: string, domain?: string) => {
    let cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;

    // Only set domain if explicitly provided and not localhost
    if (domain && !window.location.hostname.includes("localhost")) {
      cookie += `; domain=${domain}`;
    }

    document.cookie = cookie;
  }
};

// Simple storage helpers using cookies
const storage = {
  store: (key: string, data: UserData) => {
    const jsonData = JSON.stringify(data);
    cookieUtils.set(key, jsonData, 7, config.cookieDomain);

    // Also store the token separately for easy access
    cookieUtils.set("auth_token", data.access_token, 7, config.cookieDomain);
  },
  retrieve: (key: string): UserData | null => {
    try {
      const data = cookieUtils.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error parsing stored data for key '${key}':`, error);
      return null;
    }
  },
  retrieveToken: (): string | null => {
    return cookieUtils.get("auth_token");
  },
  remove: (key: string) => {
    cookieUtils.delete(key, config.cookieDomain);
    // Also remove the auth token
    cookieUtils.delete("auth_token", config.cookieDomain);
  }
};

// Helper functions
const isTokenExpired = (): boolean => {
  // With cookies and maxAge, if the cookie exists, it's still valid
  // If it doesn't exist, it has either expired or was never set
  const token = storage.retrieveToken();
  return token === null;
};

const updateAuthState = (updates: Partial<AuthState>) => {
  authState = { ...authState, ...updates };
  authListeners.forEach(listener => listener(authState));
};

const getCurrentLocale = (): string => {
  if (typeof document === "undefined") return "en";

  // Read locale from next-intl cookie
  const localeCookie = cookieUtils.get("locale");
  return localeCookie || "en";
};

const apiCall = async (endpoint: string, data?: any) => {
  const response = await fetch(`${config.agentCoreAPI}${endpoint}`, {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      "X-Locale": getCurrentLocale()
    },
    body: data ? JSON.stringify(data) : undefined
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

// Main auth functions
export const authService = {
  // Bootstrap authentication - check for existing token or handle OAuth callback
  async bootstrap(): Promise<boolean> {
    updateAuthState({ loading: true });

    try {
      // Check for existing token and user data
      const existingToken = storage.retrieveToken();
      const existingUserData = storage.retrieve("user_data");

      if (existingToken && existingUserData && !isTokenExpired()) {
        updateAuthState({
          isAuthenticated: true,
          loading: false,
          token: existingToken
        });
        return true;
      }

      // Handle OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      const error = urlParams.get("error");

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (code) {
        const redirectUri = `${window.location.origin}${window.location.pathname}`;
        const userData = await apiCall("/auth/oauth/token", {
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          state
        });

        storage.store("user_data", userData);

        updateAuthState({
          isAuthenticated: true,
          loading: false,
          token: userData.access_token
        });

        // Clean up URL
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        return true;
      }

      updateAuthState({ loading: false });
      return false;
    } catch (error) {
      console.error("Authentication bootstrap failed:", error);
      updateAuthState({ loading: false });
      return false;
    }
  },

  // Initiate Google OAuth login
  async loginWithGoogle(): Promise<void> {
    try {
      const state = crypto.randomUUID();
      const redirectUri = `${window.location.origin}${window.location.pathname}`;

      const response = await apiCall("/auth/oauth/initiate", {
        redirect_uri: redirectUri,
        state,
        scopes: config.oAuthScopes
      });

      if (response.auth_url) {
        window.location.href = response.auth_url;
      } else {
        throw new Error("No auth URL received");
      }
    } catch (error) {
      console.error("OAuth login failed:", error);
      throw error;
    }
  },

  // Get current token
  getToken(): string | null {
    return authState.token;
  },

  // Check if authenticated
  isAuthenticated(): boolean {
    return authState.isAuthenticated;
  },

  // Logout
  async logout(): Promise<void> {
    storage.remove("user_data");
    updateAuthState({
      isAuthenticated: false,
      loading: false,
      token: null
    });
  },

  // Get current auth state
  getState(): AuthState {
    return { ...authState };
  },

  // Subscribe to auth state changes
  onStateChange(listener: (state: AuthState) => void): () => void {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  },

  // Debug function to troubleshoot cookie issues
  debug(): void {
    console.log("=== Auth Debug Info ===");
    console.log("Current domain:", window.location.hostname);
    console.log("Protocol:", window.location.protocol);
    console.log("All cookies:", document.cookie);
    console.log("Auth token:", storage.retrieveToken());
    console.log("User data:", storage.retrieve("user_data"));
    console.log("Auth state:", authState);
    console.log("Token expired?", isTokenExpired());
    console.log("======================");
  }
};

// Default export for backward compatibility
export default authService;
