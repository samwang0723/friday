/**
 * Authentication Module Tests
 * Comprehensive test suite for auth.ts
 */

import {
  AuthModule,
  AuthError,
  TokenError,
  OAuthError,
  SecureTokenStorage,
  AuthConfigManager,
  getAuthModule,
  type TokenData,
  type AuthConfig,
  type AuthEvents
} from "../auth";

// Mock fetch globally
global.fetch = jest.fn();

// Mock crypto.randomUUID
Object.defineProperty(global, "crypto", {
  value: {
    randomUUID: jest.fn(() => "mock-uuid-123")
  }
});

// Mock sessionStorage
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
};

Object.defineProperty(window, "sessionStorage", {
  value: mockSessionStorage
});

// Mock environment variables
const originalEnv = process.env;

// Mock token data for tests
const mockTokenData: TokenData = {
  access_token: "test-access-token",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "test-refresh-token",
  timestamp: Date.now(),
  scope: "test-scope"
};

describe("Auth Module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    Object.keys(mockSessionStorage).forEach((key) => {
      if (
        typeof mockSessionStorage[key as keyof typeof mockSessionStorage] ===
        "function"
      ) {
        (
          mockSessionStorage[
            key as keyof typeof mockSessionStorage
          ] as jest.Mock
        ).mockClear();
      }
    });

    // Reset singleton instance for clean tests
    (AuthConfigManager as any).instance = undefined;

    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_AGENT_CORE_API: "http://localhost:3030/api/v1",
      NEXT_PUBLIC_OAUTH_SCOPES: "scope1,scope2,scope3"
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Error Classes", () => {
    describe("AuthError", () => {
      it("should create AuthError with message and code", () => {
        const error = new AuthError("Test error", "TEST_CODE", {
          detail: "test"
        });
        expect(error.name).toBe("AuthError");
        expect(error.message).toBe("Test error");
        expect(error.code).toBe("TEST_CODE");
        expect(error.details).toEqual({ detail: "test" });
      });
    });

    describe("TokenError", () => {
      it("should create TokenError with proper inheritance", () => {
        const error = new TokenError("Token error", { token: "invalid" });
        expect(error.name).toBe("TokenError");
        expect(error.message).toBe("Token error");
        expect(error.code).toBe("TOKEN_ERROR");
        expect(error.details).toEqual({ token: "invalid" });
        expect(error instanceof AuthError).toBe(true);
      });
    });

    describe("OAuthError", () => {
      it("should create OAuthError with proper inheritance", () => {
        const error = new OAuthError("OAuth error", { oauth: "failed" });
        expect(error.name).toBe("OAuthError");
        expect(error.message).toBe("OAuth error");
        expect(error.code).toBe("OAUTH_ERROR");
        expect(error.details).toEqual({ oauth: "failed" });
        expect(error instanceof AuthError).toBe(true);
      });
    });
  });

  describe("AuthConfigManager", () => {
    it("should create singleton instance", () => {
      const instance1 = AuthConfigManager.getInstance();
      const instance2 = AuthConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return config with environment variables", () => {
      const config = AuthConfigManager.getInstance().getConfig();
      expect(config).toMatchObject({
        agentCoreAPI: "http://localhost:3030/api/v1",
        oAuthScopes: ["scope1", "scope2", "scope3"],
        tokenStorageKey: "oauth_token",
        stateStorageKey: "oauth_state",
        stateExpirationMs: 10 * 60 * 1000,
        tokenRefreshThresholdMs: 5 * 60 * 1000
      });
    });

    it("should update config", () => {
      const manager = AuthConfigManager.getInstance();
      const newConfig = { agentCoreAPI: "http://new-api.com" };
      manager.updateConfig(newConfig);

      const updatedConfig = manager.getConfig();
      expect(updatedConfig.agentCoreAPI).toBe("http://new-api.com");
    });

    it("should use default values when env vars are missing", () => {
      delete process.env.NEXT_PUBLIC_AGENT_CORE_API;
      delete process.env.NEXT_PUBLIC_OAUTH_SCOPES;

      // Reset instance to get fresh config
      (AuthConfigManager as any).instance = undefined;

      const config = AuthConfigManager.getInstance().getConfig();
      expect(config.agentCoreAPI).toBe("http://localhost:3030/api/v1");
      expect(config.oAuthScopes).toEqual([
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/calendar"
      ]);
    });
  });

  describe("SecureTokenStorage", () => {
    let storage: SecureTokenStorage;
    const localMockTokenData: TokenData = {
      access_token: "test-token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "refresh-token",
      timestamp: Date.now(),
      scope: "test-scope"
    };

    beforeEach(() => {
      storage = new SecureTokenStorage();
    });

    it("should store token data", async () => {
      await storage.store("test-key", localMockTokenData);
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "test-key",
        JSON.stringify(localMockTokenData)
      );
    });

    it("should retrieve token data", async () => {
      mockSessionStorage.getItem.mockReturnValue(
        JSON.stringify(localMockTokenData)
      );
      const result = await storage.retrieve("test-key");
      expect(result).toEqual(localMockTokenData);
      expect(mockSessionStorage.getItem).toHaveBeenCalledWith("test-key");
    });

    it("should return null when no data exists", async () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      const result = await storage.retrieve("test-key");
      expect(result).toBeNull();
    });

    it("should remove token data", async () => {
      await storage.remove("test-key");
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith("test-key");
    });

    it("should throw TokenError on storage failure", async () => {
      mockSessionStorage.setItem.mockImplementation(() => {
        throw new Error("Storage full");
      });

      await expect(
        storage.store("test-key", localMockTokenData)
      ).rejects.toThrow(TokenError);
    });

    it("should throw TokenError on retrieval failure", async () => {
      mockSessionStorage.getItem.mockImplementation(() => {
        throw new Error("Storage error");
      });

      await expect(storage.retrieve("test-key")).rejects.toThrow(TokenError);
    });

    it("should throw TokenError on removal failure", async () => {
      mockSessionStorage.removeItem.mockImplementation(() => {
        throw new Error("Storage error");
      });

      await expect(storage.remove("test-key")).rejects.toThrow(TokenError);
    });
  });

  describe("AuthModule", () => {
    let authModule: AuthModule;
    let mockStorage: SecureTokenStorage;
    let mockConfigManager: AuthConfigManager;

    beforeEach(() => {
      mockStorage = new SecureTokenStorage();
      mockConfigManager = AuthConfigManager.getInstance();
      authModule = new AuthModule(mockStorage, mockConfigManager);
    });

    afterEach(() => {
      if (authModule) {
        authModule.dispose();
      }
    });

    describe("bootstrap", () => {
      it("should return true when valid token exists", async () => {
        jest.spyOn(mockStorage, "retrieve").mockResolvedValue(mockTokenData);

        const eventSpy = jest.fn();
        authModule.on("authenticated", eventSpy);

        const result = await authModule.bootstrap();

        expect(result).toBe(true);
        expect(eventSpy).toHaveBeenCalledWith({ tokenData: mockTokenData });
      });

      it("should handle expired token", async () => {
        const expiredToken = {
          ...mockTokenData,
          timestamp: Date.now() - 7200000 // 2 hours ago
        };
        jest.spyOn(mockStorage, "retrieve").mockResolvedValue(expiredToken);
        jest.spyOn(mockStorage, "remove").mockResolvedValue();

        const result = await authModule.bootstrap();

        expect(result).toBe(false);
      });

      it("should emit authenticationFailed on error", async () => {
        jest
          .spyOn(mockStorage, "retrieve")
          .mockRejectedValue(new Error("Storage error"));

        const eventSpy = jest.fn();
        authModule.on("authenticationFailed", eventSpy);

        const result = await authModule.bootstrap();

        expect(result).toBe(false);
        expect(eventSpy).toHaveBeenCalledWith({
          error: expect.any(AuthError)
        });
      });
    });

    describe("getToken", () => {
      it("should return access token when valid", async () => {
        jest.spyOn(mockStorage, "retrieve").mockResolvedValue(mockTokenData);
        await authModule.bootstrap();

        const token = authModule.getToken();
        expect(token).toBe("test-access-token");
      });

      it("should return null when no token exists", () => {
        const token = authModule.getToken();
        expect(token).toBeNull();
      });

      it("should return null when token is expired", async () => {
        const expiredToken = {
          ...mockTokenData,
          timestamp: Date.now() - 7200000 // 2 hours ago
        };
        jest.spyOn(mockStorage, "retrieve").mockResolvedValue(expiredToken);
        await authModule.bootstrap();

        const token = authModule.getToken();
        expect(token).toBeNull();
      });
    });

    describe("logout", () => {
      it("should clear all authentication data", async () => {
        jest.spyOn(mockStorage, "remove").mockResolvedValue();
        mockSessionStorage.removeItem.mockImplementation(() => {});

        const eventSpy = jest.fn();
        authModule.on("logout", eventSpy);

        await authModule.logout();

        expect(mockStorage.remove).toHaveBeenCalledWith("oauth_token");
        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
          "oauth_state"
        );
        expect(eventSpy).toHaveBeenCalledWith({});
        expect(authModule.isAuthenticated()).toBe(false);
      });

      it("should handle logout failure", async () => {
        jest
          .spyOn(mockStorage, "remove")
          .mockRejectedValue(new Error("Storage error"));

        await expect(authModule.logout()).rejects.toThrow(AuthError);
      });
    });

    describe("isAuthenticated", () => {
      it("should return true when authenticated", async () => {
        jest.spyOn(mockStorage, "retrieve").mockResolvedValue(mockTokenData);
        await authModule.bootstrap();

        expect(authModule.isAuthenticated()).toBe(true);
      });

      it("should return false when not authenticated", () => {
        expect(authModule.isAuthenticated()).toBe(false);
      });
    });

    describe("refreshToken", () => {
      it("should refresh token successfully", async () => {
        const newTokenData = {
          ...mockTokenData,
          access_token: "new-access-token"
        };

        // Set initial token
        jest.spyOn(mockStorage, "retrieve").mockResolvedValue(mockTokenData);
        await authModule.bootstrap();

        // Mock refresh response
        (fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => newTokenData
        });
        jest.spyOn(mockStorage, "store").mockResolvedValue();

        const eventSpy = jest.fn();
        authModule.on("tokenRefreshed", eventSpy);

        const result = await authModule.refreshToken();

        expect(result).toBe(true);
        expect(eventSpy).toHaveBeenCalledWith({
          tokenData: expect.objectContaining({
            access_token: "new-access-token"
          })
        });
      });

      it("should return false when no refresh token", async () => {
        const tokenWithoutRefresh = {
          ...mockTokenData,
          refresh_token: undefined
        };
        jest
          .spyOn(mockStorage, "retrieve")
          .mockResolvedValue(tokenWithoutRefresh);
        await authModule.bootstrap();

        const result = await authModule.refreshToken();
        expect(result).toBe(false);
      });

      it("should handle refresh failure", async () => {
        jest.spyOn(mockStorage, "retrieve").mockResolvedValue(mockTokenData);
        await authModule.bootstrap();

        (fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized"
        });

        const eventSpy = jest.fn();
        authModule.on("authenticationFailed", eventSpy);

        const result = await authModule.refreshToken();

        expect(result).toBe(false);
        expect(eventSpy).toHaveBeenCalledWith({
          error: expect.any(AuthError)
        });
      });
    });

    describe("Event Emitter", () => {
      it("should emit and listen to events correctly", () => {
        const eventSpy = jest.fn();
        authModule.on("message", eventSpy);

        authModule.emit("message", { message: "test", type: "info" });

        expect(eventSpy).toHaveBeenCalledWith({
          message: "test",
          type: "info"
        });
      });

      it("should remove event listeners", () => {
        const eventSpy = jest.fn();
        authModule.on("message", eventSpy);
        authModule.off("message", eventSpy);

        authModule.emit("message", { message: "test", type: "info" });

        expect(eventSpy).not.toHaveBeenCalled();
      });

      it("should remove all listeners on dispose", () => {
        const eventSpy = jest.fn();
        authModule.on("message", eventSpy);

        authModule.dispose();
        authModule.emit("message", { message: "test", type: "info" });

        expect(eventSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("Module Exports", () => {
    it("should provide singleton instance via getAuthModule", () => {
      const instance1 = getAuthModule();
      const instance2 = getAuthModule();
      expect(instance1).toBe(instance2);
    });

    it("should export all required classes and types", () => {
      expect(AuthModule).toBeDefined();
      expect(AuthError).toBeDefined();
      expect(TokenError).toBeDefined();
      expect(OAuthError).toBeDefined();
      expect(SecureTokenStorage).toBeDefined();
      expect(AuthConfigManager).toBeDefined();
      expect(getAuthModule).toBeDefined();
    });
  });

  describe("Token Validation", () => {
    let authModule: AuthModule;

    beforeEach(() => {
      authModule = new AuthModule();
    });

    afterEach(() => {
      authModule.dispose();
    });

    it("should detect expired tokens", async () => {
      const expiredToken = {
        ...mockTokenData,
        expires_in: 3600,
        timestamp: Date.now() - 7200000 // 2 hours ago, token expired 1 hour ago
      };

      jest
        .spyOn(SecureTokenStorage.prototype, "retrieve")
        .mockResolvedValue(expiredToken);
      jest.spyOn(SecureTokenStorage.prototype, "remove").mockResolvedValue();

      const result = await authModule.bootstrap();
      expect(result).toBe(false);
    });

    it("should handle tokens without expiration", async () => {
      const tokenWithoutExpiry = {
        access_token: "test-token",
        token_type: "Bearer",
        timestamp: Date.now()
      } as TokenData;

      jest
        .spyOn(SecureTokenStorage.prototype, "retrieve")
        .mockResolvedValue(tokenWithoutExpiry);

      const result = await authModule.bootstrap();
      expect(result).toBe(true);
    });
  });

  describe("OAuth State Management", () => {
    let authModule: AuthModule;

    beforeEach(() => {
      authModule = new AuthModule();
    });

    afterEach(() => {
      authModule.dispose();
    });

    it("should handle OAuth state validation errors", async () => {
      // Test missing stored state
      mockSessionStorage.getItem.mockReturnValue(null);

      try {
        await (authModule as any).validateOAuthState("test-state");
        fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).message).toBe(
          "No stored OAuth state found"
        );
      }
    });

    it("should handle invalid stored state format", async () => {
      mockSessionStorage.getItem.mockReturnValue("invalid-json");

      try {
        await (authModule as any).validateOAuthState("test-state");
        fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).message).toBe(
          "Invalid stored OAuth state format"
        );
      }
    });

    it("should detect state mismatch (CSRF protection)", async () => {
      const stateData = {
        state: "different-state",
        timestamp: Date.now(),
        nonce: "test-nonce"
      };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(stateData));

      try {
        await (authModule as any).validateOAuthState("test-state");
        fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).message).toBe(
          "Invalid OAuth state - possible CSRF attack"
        );
      }
    });

    it("should detect expired OAuth state", async () => {
      const stateData = {
        state: "test-state",
        timestamp: Date.now() - 15 * 60 * 1000, // 15 minutes ago (expired)
        nonce: "test-nonce"
      };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(stateData));

      try {
        await (authModule as any).validateOAuthState("test-state");
        fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).message).toBe("OAuth state expired");
      }
    });

    it("should generate secure state", async () => {
      // Reset the mock to ensure clean state
      mockSessionStorage.setItem.mockImplementation(() => {});

      const state = await (authModule as any).generateSecureState();

      expect(state).toBe("mock-uuid-123");
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "oauth_state",
        expect.stringContaining("mock-uuid-123")
      );
    });

    it("should clean up state after successful validation", async () => {
      const stateData = {
        state: "test-state",
        timestamp: Date.now(),
        nonce: "test-nonce"
      };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(stateData));
      mockSessionStorage.removeItem.mockImplementation(() => {});

      await (authModule as any).validateOAuthState("test-state");

      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith("oauth_state");
    });
  });

  describe("Token Expiry and Refresh Scheduling", () => {
    let authModule: AuthModule;

    beforeEach(() => {
      authModule = new AuthModule();
      jest.useFakeTimers();
    });

    afterEach(() => {
      authModule.dispose();
      jest.useRealTimers();
    });

    it("should schedule token refresh before expiry", async () => {
      const tokenData = {
        ...mockTokenData,
        expires_in: 3600, // 1 hour
        timestamp: Date.now()
      };

      jest.spyOn(authModule, "refreshToken").mockResolvedValue(true);
      jest
        .spyOn(SecureTokenStorage.prototype, "retrieve")
        .mockResolvedValue(tokenData);

      await authModule.bootstrap();

      // Fast-forward to near token expiry (55 minutes)
      jest.advanceTimersByTime(55 * 60 * 1000);

      expect(authModule.refreshToken).toHaveBeenCalled();
    });

    it("should handle tokens without refresh token for scheduling", async () => {
      const tokenWithoutRefresh = {
        ...mockTokenData,
        refresh_token: undefined,
        expires_in: 3600,
        timestamp: Date.now()
      };

      jest
        .spyOn(SecureTokenStorage.prototype, "retrieve")
        .mockResolvedValue(tokenWithoutRefresh);

      // Should not throw an error even without refresh token
      await authModule.bootstrap();

      // Advance time - no refresh should be scheduled
      jest.advanceTimersByTime(60 * 60 * 1000);
    });

    it("should handle token expiry timeout", async () => {
      jest.spyOn(authModule, "logout").mockResolvedValue();

      const eventSpy = jest.fn();
      authModule.on("message", eventSpy);

      await (authModule as any).handleTokenExpiry();

      expect(eventSpy).toHaveBeenCalledWith({
        message: "Token expired",
        type: "system"
      });
      expect(authModule.logout).toHaveBeenCalled();
    });
  });

  describe("OAuth Flow Integration", () => {
    let authModule: AuthModule;

    beforeEach(() => {
      authModule = new AuthModule();
    });

    afterEach(() => {
      authModule.dispose();
      jest.useRealTimers();
    });

    it("should handle OAuth timeout", () => {
      jest.useFakeTimers();

      const eventSpy = jest.fn();
      authModule.on("authTimeout", eventSpy);

      // Simulate OAuth in progress
      (authModule as any).isOAuthInProgress = true;

      // Trigger OAuth timeout directly
      (authModule as any).setOAuthTimeout();

      // Fast forward 5 minutes to trigger timeout
      jest.advanceTimersByTime(5 * 60 * 1000);

      expect(eventSpy).toHaveBeenCalledWith({});
      expect((authModule as any).isOAuthInProgress).toBe(false);

      jest.useRealTimers();
    });

    it("should prevent duplicate OAuth attempts", async () => {
      (authModule as any).isOAuthInProgress = true;

      const messageSpy = jest.fn();
      authModule.on("message", messageSpy);

      await authModule.loginWithGoogle();

      expect(messageSpy).toHaveBeenCalledWith({
        message: "Authentication already in progress",
        type: "info"
      });
    });
  });

  describe("HTTP Client", () => {
    it("should handle HTTP errors properly", async () => {
      const authModule = new AuthModule();

      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error"
      });

      const eventSpy = jest.fn();
      authModule.on("authenticationFailed", eventSpy);

      await authModule.loginWithGoogle();

      expect(eventSpy).toHaveBeenCalledWith({
        error: expect.any(AuthError)
      });

      authModule.dispose();
    });

    it("should handle network errors", async () => {
      const authModule = new AuthModule();

      (fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      const eventSpy = jest.fn();
      authModule.on("authenticationFailed", eventSpy);

      await authModule.loginWithGoogle();

      expect(eventSpy).toHaveBeenCalledWith({
        error: expect.any(AuthError)
      });

      authModule.dispose();
    });
  });
});
