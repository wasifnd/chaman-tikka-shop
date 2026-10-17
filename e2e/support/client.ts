import { randomInt, randomUUID } from 'node:crypto';
import { request, type APIRequestContext } from '@playwright/test';

export const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';

/** The demo accounts created by `npm run db:seed`. Override with E2E_* when yours differ. */
export const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@bbqstore.local',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'ChangeMe123!',
};
export const STAFF = {
  email: process.env['E2E_STAFF_EMAIL'] ?? 'staff@bbqstore.local',
  password: process.env['E2E_STAFF_PASSWORD'] ?? 'ChangeMe123!',
};

export interface Reply {
  status: number;
  headers: Record<string, string>;
  /** The "data" of a successful { success, data } reply, otherwise null. */
  data: Record<string, unknown> | null;
  /** The "error" of a failed reply, otherwise null. */
  error: { code: string; message: string; details?: Record<string, string> } | null;
  /** Raw body for pages and anything that is not our JSON envelope. */
  text: string;
}

export interface Api {
  context: APIRequestContext;
  /** The made-up address this client appears to come from, so rate limits are per client. */
  ip: string;
  get(path: string, headers?: Record<string, string>): Promise<Reply>;
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Reply>;
  patch(path: string, body?: unknown, headers?: Record<string, string>): Promise<Reply>;
  put(path: string, body?: unknown, headers?: Record<string, string>): Promise<Reply>;
  del(path: string, headers?: Record<string, string>): Promise<Reply>;
  /** Requests a page without following redirects, to see where it would send the visitor. */
  page(path: string): Promise<Reply>;
  login(email: string, password: string): Promise<Reply>;
  logout(): Promise<Reply>;
  /** The value of a cookie this client currently holds, or undefined. */
  cookie(name: string): Promise<string | undefined>;
  dispose(): Promise<void>;
}

/** A random address in a private range, so each client has its own rate-limit buckets. */
const randomIp = () =>
  `10.${String(randomInt(1, 255))}.${String(randomInt(0, 255))}.${String(randomInt(1, 255))}`;

/** A mobile number that has never ordered before (the kitchen is protected from repeat floods). */
export const randomPhone = () => `03${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;

export const randomEmail = (prefix = 'e2e') => `${prefix}.${randomUUID().slice(0, 8)}@example.com`;

async function toReply(response: Awaited<ReturnType<APIRequestContext['fetch']>>): Promise<Reply> {
  const text = await response.text();
  let data: Reply['data'] = null;
  let error: Reply['error'] = null;
  try {
    const parsed = JSON.parse(text) as {
      success?: boolean;
      data?: Reply['data'];
      error?: Reply['error'];
    };
    if (parsed.success) data = parsed.data ?? {};
    else if (parsed.error) error = parsed.error;
  } catch {
    // Not JSON (a page): leave data and error empty.
  }
  return { status: response.status(), headers: response.headers(), data, error, text };
}

export async function newApi(options: { ip?: string; autoRefresh?: boolean } = {}): Promise<Api> {
  const ip = options.ip ?? randomIp();
  const context = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
  });

  const attempt = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
    maxRedirects?: number,
  ) =>
    toReply(
      await context.fetch(path, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { data: JSON.stringify(body) }),
        ...(maxRedirects === undefined ? {} : { maxRedirects }),
      }),
    );

  /**
   * Like the site's own screens: when the 15-minute login has run out, quietly renew it with the
   * refresh cookie and try once more.
   */
  const send: typeof attempt = async (method, path, body, headers, maxRedirects) => {
    const first = await attempt(method, path, body, headers, maxRedirects);
    if (first.status !== 401 || !options.autoRefresh) return first;
    const state = await context.storageState();
    if (!state.cookies.some((cookie) => cookie.name === 'bbq_rt')) return first;
    const renewed = await attempt('POST', '/api/auth/refresh', {});
    return renewed.status === 200 ? attempt(method, path, body, headers, maxRedirects) : first;
  };

  const api: Api = {
    context,
    ip,
    get: (path, headers) => send('GET', path, undefined, headers),
    post: (path, body, headers) => send('POST', path, body ?? {}, headers),
    patch: (path, body, headers) => send('PATCH', path, body ?? {}, headers),
    put: (path, body, headers) => send('PUT', path, body ?? {}, headers),
    del: (path, headers) => send('DELETE', path, undefined, headers),
    page: (path) => send('GET', path, undefined, {}, 0),
    login: (email, password) => api.post('/api/auth/login', { email, password }),
    logout: () => api.post('/api/auth/logout'),
    async cookie(name) {
      const state = await context.storageState();
      return state.cookies.find((cookie) => cookie.name === name)?.value;
    },
    dispose: () => context.dispose(),
  };
  return api;
}

const shared = new Map<string, Promise<Api>>();

/**
 * A client signed in as the given account, shared by every scenario in this run. The shop limits
 * sign-ins per account (to stop password guessing), so signing in again for every scenario would
 * lock the demo accounts out. It renews its own login when it expires, and cannot be disposed.
 */
export function signedIn(account: { email: string; password: string }): Promise<Api> {
  const cached = shared.get(account.email);
  if (cached) return cached;
  const created = (async () => {
    const api = await newApi({ autoRefresh: true });
    const reply = await api.login(account.email, account.password);
    if (reply.status !== 200) {
      await api.dispose();
      throw new Error(`Could not sign in as ${account.email}: ${reply.status} ${reply.text}`);
    }
    return { ...api, dispose: () => Promise.resolve() };
  })();
  shared.set(account.email, created);
  // A failed sign-in must not be remembered, or every later scenario would fail the same way.
  created.catch(() => shared.delete(account.email));
  return created;
}
