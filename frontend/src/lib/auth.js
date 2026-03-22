const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`;

export const STORAGE_KEYS = {
  apiBase: "scheduler.apiBase",
  token: "scheduler.accessToken",
  user: "scheduler.currentUser",
};

export function getStoredApiBase() {
  return localStorage.getItem(STORAGE_KEYS.apiBase) || DEFAULT_API_BASE;
}

export function getStoredToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || "";
}

export function getStoredUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistSession(apiBase, token, user) {
  localStorage.setItem(STORAGE_KEYS.apiBase, apiBase);
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

export function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEYS.apiBase);
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.user);
}
