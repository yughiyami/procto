import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiClient } from '../lib/apiClient';
import { clearToken, getToken, setToken } from './tokenStorage';

type AuthContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  const signIn = useCallback(async (candidate: string) => {
    // Persist optimistically so the validating request is sent with this
    // candidate token (apiClient reads the token from storage on each call),
    // then roll back if the API rejects it.
    setToken(candidate);
    try {
      // Cheapest authenticated read that proves the credential resolves to an org.
      await apiClient.listOrders();
    } catch (err) {
      clearToken();
      setTokenState(null);
      throw err;
    }
    setTokenState(candidate);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, isAuthenticated: token !== null, signIn, signOut }),
    [token, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
