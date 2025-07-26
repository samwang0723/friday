/**
 * Authentication Hook
 * Manages authentication state and provides auth functions
 */

import { useState, useEffect, useMemo } from "react";
import authService from "@/lib/auth";

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    loading: true
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        const authenticated = await authService.bootstrap();
        setAuthState({
          isAuthenticated: authenticated,
          loading: false
        });
      } catch (error) {
        console.error("Authentication bootstrap failed:", error);
        setAuthState({
          isAuthenticated: false,
          loading: false
        });
      }
    };

    initAuth();

    // Listen for auth state changes
    const unsubscribe = authService.onStateChange(state => {
      setAuthState({
        isAuthenticated: state.isAuthenticated,
        loading: state.loading
      });
    });

    return unsubscribe;
  }, []);

  // Memoize the function references to prevent unnecessary re-renders
  const login = useMemo(() => authService.loginWithGoogle, []);
  const logout = useMemo(() => authService.logout, []);
  const getToken = useMemo(() => authService.getToken, []);

  return {
    ...authState,
    login,
    logout,
    getToken
  };
}
