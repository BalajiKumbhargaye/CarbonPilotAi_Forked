export type OrganizationType = 'CUSTOMER' | 'SUPPLIER';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: {
    id: string;
    name: string;
    type: OrganizationType;
  };
}

export interface SessionData {
  token: string;
  user: SessionUser;
}

const STORAGE_KEY = 'carbonpilot_session';

export function getStoredSession(): SessionData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session: SessionData) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

function buildUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  return `${base.replace(/\/$/, '')}${path}`;
}

async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(buildUrl(path), {
      ...options,
      headers,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const message = payload?.error?.message || payload?.message || 'Request failed';
      throw new Error(message);
    }

    return (payload.data ?? payload) as T;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the CarbonPilot API. Please start the backend server on http://localhost:4000 and try again.');
    }

    throw error;
  }
}

export async function apiLogin(payload: { email: string; password: string }) {
  return apiFetch<{ token: string; user: SessionUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiRegister(payload: {
  name: string;
  email: string;
  password: string;
  organizationName: string;
  organizationType: OrganizationType;
  role: 'CUSTOMER_ADMIN' | 'SUPPLIER_ADMIN';
  industry?: string;
}) {
  return apiFetch<{ token: string; user: SessionUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiCurrentUser() {
  const session = getStoredSession();
  if (!session?.token) {
    throw new Error('Missing session');
  }

  return apiFetch<{ user: SessionUser; organization: { id: string; name: string; type: OrganizationType } }>(
    '/api/auth/me',
    { method: 'GET' },
    session.token
  );
}
