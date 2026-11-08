const STORAGE_KEY = 'izumi.token';

/**
 * sessionStorage access must never throw uncaught: private browsing modes and
 * some embedded webviews throw on any storage access.
 */
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Ignore: storage unavailable (private mode). The session simply won't persist.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
