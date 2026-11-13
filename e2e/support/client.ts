import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { request, type APIRequestContext } from '@playwright/test';

export const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000';

/** The demo accounts created by `npm run db:seed`. Override with E2E_* when yours differ. */
export const ADMIN = {
  phone: process.env['E2E_ADMIN_PHONE'] ?? '03000000001',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'ChangeMe123!',
};
export const STAFF = {
  phone: process.env['E2E_STAFF_PHONE'] ?? '03000000002',
  password: process.env['E2E_STAFF_PASSWORD'] ?? 'ChangeMe123!',
};

/**
 * The WhatsApp app secret the site under test was started with (WHATSAPP_APP_SECRET), so these
 * scenarios can deliver "customer sent us a message" calls exactly as Meta signs them.
 */
export const WHATSAPP_APP_SECRET =
  process.env['E2E_WHATSAPP_APP_SECRET'] ?? 'e2e-whatsapp-app-secret';

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
  login(phone: string, password: string): Promise<Reply>;
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
    login: (phone, password) => api.post('/api/auth/login', { phone, password }),
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
export function signedIn(account: { phone: string; password: string }): Promise<Api> {
  const cached = shared.get(account.phone);
  if (cached) return cached;
  const created = (async () => {
    const api = await newApi({ autoRefresh: true });
    const reply = await api.login(account.phone, account.password);
    if (reply.status !== 200) {
      await api.dispose();
      throw new Error(`Could not sign in as ${account.phone}: ${reply.status} ${reply.text}`);
    }
    return { ...api, dispose: () => Promise.resolve() };
  })();
  shared.set(account.phone, created);
  // A failed sign-in must not be remembered, or every later scenario would fail the same way.
  created.catch(() => shared.delete(account.phone));
  return created;
}

/** "0300-1234567" or "+92 300 1234567" as WhatsApp writes it: 923001234567. */
const international = (phone: string) =>
  `92${phone
    .replace(/[\s\-()]/g, '')
    .replace(/^\+?92/, '0')
    .slice(1)}`;

/** Delivers a WhatsApp message to the site's webhook, signed the way Meta signs it. */
export async function whatsappMessage(
  fromPhone: string,
  text: string,
  options: { secret?: string } = {},
): Promise<Reply> {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messages: [{ from: international(fromPhone), type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
  const signature = createHmac('sha256', options.secret ?? WHATSAPP_APP_SECRET)
    .update(payload)
    .digest('hex');
  const meta = await newApi();
  try {
    // Sent as the exact text that was signed (re-encoding it would break the signature).
    return await toReply(
      await meta.context.fetch('/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
        },
        data: payload,
      }),
    );
  } finally {
    await meta.dispose();
  }
}

/** Starts a WhatsApp check for a number, from a fresh client so each has its own rate limits. */
export async function startVerification(phone: string): Promise<{ id: string; code: string }> {
  const client = await newApi();
  try {
    const reply = await client.post('/api/v1/verify', { phone });
    if (reply.status !== 201) throw new Error(`Verify start failed: ${reply.status} ${reply.text}`);
    return reply.data as { id: string; code: string };
  } finally {
    await client.dispose();
  }
}

const proofs = new Map<string, { id: string; at: number }>();
const PROOF_REUSE_MS = 20 * 60_000; // the site accepts a proof for 30 minutes

/**
 * Proves a number like a customer does (the code arrives on WhatsApp from that number) and
 * returns the check's id for signup or checkout. Reused for a while, as the site allows.
 */
export async function verifyPhone(phone: string): Promise<string> {
  const key = international(phone);
  const known = proofs.get(key);
  if (known && Date.now() - known.at < PROOF_REUSE_MS) return known.id;
  const { id, code } = await startVerification(phone);
  const delivered = await whatsappMessage(phone, `BBQ Store code: ${code}`);
  if (delivered.status !== 200) throw new Error(`Webhook refused: ${delivered.status}`);
  proofs.set(key, { id, at: Date.now() });
  return id;
}

/** Signs up with a proven number (a fresh one unless given), like the sign-up page does. */
export async function signUp(
  api: Api,
  input: { name: string; phone?: string; email?: string; password: string },
): Promise<Reply & { phone: string }> {
  const phone = input.phone ?? randomPhone();
  const verificationId = await verifyPhone(phone);
  const reply = await api.post('/api/auth/signup', { ...input, phone, verificationId });
  return { ...reply, phone };
}
