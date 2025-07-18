/**
 * Simplified Authentication Module
 * Handles OAuth authentication with Google using simple functions
 */

interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  timestamp: number;
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
    "https://www.googleapis.com/auth/calendar.events.owned"
  ]
};

// Simple storage helpers
const storage = {
  store: (key: string, data: TokenData) => {
    sessionStorage.setItem(key, JSON.stringify(data));
  },
  retrieve: (key: string): TokenData | null => {
    const data = sessionStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  },
  remove: (key: string) => {
    sessionStorage.removeItem(key);
  }
};

// Helper functions
const isTokenExpired = (token: TokenData): boolean => {
  if (!token.expires_in || !token.timestamp) return false;
  const expirationTime = token.timestamp + token.expires_in * 1000;
  return Date.now() >= expirationTime;
};

const updateAuthState = (updates: Partial<AuthState>) => {
  authState = { ...authState, ...updates };
  authListeners.forEach(listener => listener(authState));
};

const apiCall = async (endpoint: string, data?: any) => {
  const response = await fetch(`${config.agentCoreAPI}${endpoint}`, {
    method: data ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
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
      // Check for existing token
      const existingToken = storage.retrieve("oauth_token");

      if (existingToken && !isTokenExpired(existingToken)) {
        updateAuthState({
          isAuthenticated: true,
          loading: false,
          token: existingToken.access_token
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
        const tokenData = await apiCall("/auth/oauth/token", {
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          state
        });

        tokenData.timestamp = Date.now();
        storage.store("oauth_token", tokenData);

        updateAuthState({
          isAuthenticated: true,
          loading: false,
          token: tokenData.access_token
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
    storage.remove("oauth_token");
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
  }
};

// Default export for backward compatibility
export default authService;
