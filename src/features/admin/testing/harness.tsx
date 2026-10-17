import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';

type Handler = (body: unknown, init?: RequestInit) => Response;

export interface ApiCall {
  method: string;
  url: string;
  body: unknown;
}

/**
 * A pretend server for component tests. Register what each endpoint answers; afterwards `calls`
 * says exactly what the screen sent, which is what these tests check.
 */
export function createApiMock() {
  const routes = new Map<string, Handler>();
  const calls: ApiCall[] = [];

  const key = (method: string, url: string) => `${method} ${url}`;
  const api = {
    calls,
    on(method: string, url: string, handler: Handler) {
      routes.set(key(method, url), handler);
    },
    /** Answers { success: true, data } */
    succeed(method: string, url: string, data: unknown = {}, status = 200) {
      routes.set(key(method, url), () => Response.json({ success: true, data }, { status }));
    },
    /** Answers with the API's error shape. */
    fail(
      method: string,
      url: string,
      code: string,
      message: string,
      status = 400,
      details?: Record<string, string>,
    ) {
      routes.set(key(method, url), () =>
        Response.json(
          { success: false, error: { code, message, ...(details ? { details } : {}) } },
          { status },
        ),
      );
    },
    last: () => calls.at(-1),
    reset() {
      routes.clear();
      calls.length = 0;
    },
    install() {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string, init?: RequestInit) => {
          const method = init?.method ?? 'GET';
          let body: unknown;
          if (typeof init?.body === 'string') body = JSON.parse(init.body);
          calls.push({ method, url: input, body });
          const handler = routes.get(key(method, input));
          return Promise.resolve(
            handler ? handler(body, init) : Response.json({ success: true, data: {} }),
          );
        }),
      );
    },
  };
  return api;
}

/** Use inside a describe: gives each test a fresh pretend server and cleans the screen after. */
export function useApiMock() {
  const api = createApiMock();
  beforeEach(() => {
    api.reset();
    api.install();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  return api;
}

export function renderAdmin(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

export const typeInto = (label: string | RegExp, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

export const click = (name: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

export const submit = (name: string | RegExp = 'Save') => {
  fireEvent.click(screen.getByRole('button', { name }));
};

/** Waits until the screen has made a call, then returns it. */
export async function nextCall(api: ReturnType<typeof createApiMock>, method: string) {
  await waitFor(() => {
    if (!api.calls.some((call) => call.method === method)) throw new Error(`no ${method} yet`);
  });
  return api.calls.filter((call) => call.method === method).at(-1);
}
