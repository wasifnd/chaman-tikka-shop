// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import { AuthMenu } from './AuthMenu';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

type Handler = (init?: RequestInit) => Response;
let routes: Record<string, Handler> = {};
const calls: { url: string; init?: RequestInit | undefined }[] = [];

const json =
  (body: unknown, status = 200): Handler =>
  () =>
    Response.json(body, { status });

beforeEach(() => {
  routes = {};
  calls.length = 0;
  router.push.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      calls.push({ url: input, init });
      const handler = routes[input];
      return Promise.resolve(handler ? handler(init) : Response.json({}, { status: 404 }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LoginForm', () => {
  it('shows validation errors and does not call the API', async () => {
    renderWithProviders(<LoginForm next="/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('logs in and redirects to the requested page', async () => {
    routes['/api/auth/login'] = json({ success: true, data: { user: {} } });
    renderWithProviders(<LoginForm next="/account/orders" />);
    type('Email', ' Ali@Example.com ');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/account/orders');
    });
    expect(router.refresh).toHaveBeenCalled();
    const body = calls[0]?.init?.body;
    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toEqual({
      email: 'ali@example.com',
      password: 'secret123',
    });
  });

  it('shows the server message for wrong credentials and stays on the page', async () => {
    routes['/api/auth/login'] = json(
      {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
      },
      401,
    );
    renderWithProviders(<LoginForm next="/" />);
    type('Email', 'ali@example.com');
    type('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('maps server field errors onto the inputs', async () => {
    routes['/api/auth/login'] = json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'bad', details: { email: 'Server says no' } },
      },
      422,
    );
    renderWithProviders(<LoginForm next="/" />);
    type('Email', 'ali@example.com');
    type('Password', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Server says no')).toBeInTheDocument();
  });
});

describe('SignupForm', () => {
  it('validates password length and phone format', async () => {
    renderWithProviders(<SignupForm next="/" />);
    type('Full name', 'Ali Khan');
    type('Email', 'ali@example.com');
    type('Password', 'short');
    type('Mobile number (optional)', '123');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText(/valid mobile number/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('creates the account and redirects', async () => {
    routes['/api/auth/signup'] = json({ success: true, data: { user: {} } }, 201);
    renderWithProviders(<SignupForm next="/" />);
    type('Full name', 'Ali Khan');
    type('Email', 'ali@example.com');
    type('Password', 'longenough1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/');
    });
  });

  it('shows a duplicate-email error from the server', async () => {
    routes['/api/auth/signup'] = json(
      {
        success: false,
        error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' },
      },
      409,
    );
    renderWithProviders(<SignupForm next="/" />);
    type('Full name', 'Ali Khan');
    type('Email', 'ali@example.com');
    type('Password', 'longenough1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('AuthMenu', () => {
  it('shows login and signup links when signed out', async () => {
    routes['/api/auth/me'] = json({}, 401);
    routes['/api/auth/refresh'] = json({}, 401);
    renderWithProviders(<AuthMenu />);
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/auth/signup');
  });

  it('shows the user and logs out', async () => {
    routes['/api/auth/me'] = json({
      success: true,
      data: { user: { userId: 'u', email: 'ali@example.com', role: 'CUSTOMER' } },
    });
    routes['/api/auth/logout'] = json({ success: true, data: null });
    renderWithProviders(<AuthMenu />);

    expect(await screen.findByText('ali@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/');
    });
    expect(calls.some((c) => c.url === '/api/auth/logout')).toBe(true);
  });
});

describe('staff sign-in', () => {
  const signInAs = async (role: string, next: string) => {
    routes['/api/auth/login'] = json({ success: true, data: { user: { role } } });
    renderWithProviders(<LoginForm next={next} />);
    type('Email', 'staff@example.com');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
  };

  it('takes store staff straight to the order board', async () => {
    await signInAs('STORE_STAFF', '/');
    expect(router.push).toHaveBeenCalledWith('/store/orders');
  });

  it('takes admins to the order board too', async () => {
    await signInAs('ADMIN', '/');
    expect(router.push).toHaveBeenCalledWith('/store/orders');
  });

  it('takes customers to the home page', async () => {
    await signInAs('CUSTOMER', '/');
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('goes where the staff member was heading when they were asked to log in', async () => {
    await signInAs('STORE_STAFF', '/store/kitchen');
    expect(router.push).toHaveBeenCalledWith('/store/kitchen');
  });
});

describe('the header for staff', () => {
  const signedIn = (role: string) => {
    routes['/api/auth/me'] = json({
      success: true,
      data: { user: { userId: 'u', email: 'staff@example.com', role } },
    });
  };

  it('links store staff and admins to the store panel', async () => {
    for (const role of ['STORE_STAFF', 'ADMIN']) {
      signedIn(role);
      const { unmount } = renderWithProviders(<AuthMenu />);
      expect(await screen.findByRole('link', { name: 'Store' })).toHaveAttribute(
        'href',
        '/store/orders',
      );
      unmount();
    }
  });

  it('does not show the link to customers', async () => {
    signedIn('CUSTOMER');
    renderWithProviders(<AuthMenu />);
    await screen.findByText('staff@example.com');
    expect(screen.queryByRole('link', { name: 'Store' })).toBeNull();
  });
});
