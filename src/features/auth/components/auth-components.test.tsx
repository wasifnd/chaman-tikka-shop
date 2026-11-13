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

const VERIFICATION_ID = '0b8f2a8e-4c1d-4e5f-9a7b-1c2d3e4f5a6b';
const sentBody = (url: string) => {
  const body = calls.find((c) => c.url === url)?.init?.body;
  return JSON.parse(typeof body === 'string' ? body : '{}') as Record<string, unknown>;
};

describe('LoginForm', () => {
  it('shows validation errors and does not call the API', async () => {
    renderWithProviders(<LoginForm next="/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/valid mobile number/)).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('logs in by phone number and redirects to the requested page', async () => {
    routes['/api/auth/login'] = json({ success: true, data: { user: {} } });
    renderWithProviders(<LoginForm next="/account/orders" />);
    type('Mobile number', ' +92 300 1234567 ');
    type('Password', 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/account/orders');
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(sentBody('/api/auth/login')).toEqual({ phone: '03001234567', password: 'secret123' });
  });

  it('shows the server message for wrong credentials and stays on the page', async () => {
    routes['/api/auth/login'] = json(
      {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect phone number or password.' },
      },
      401,
    );
    renderWithProviders(<LoginForm next="/" />);
    type('Mobile number', '03001234567');
    type('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Incorrect phone number or password.')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('maps server field errors onto the inputs', async () => {
    routes['/api/auth/login'] = json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'bad', details: { phone: 'Server says no' } },
      },
      422,
    );
    renderWithProviders(<LoginForm next="/" />);
    type('Mobile number', '03001234567');
    type('Password', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Server says no')).toBeInTheDocument();
  });
});

describe('SignupForm', () => {
  /** The WhatsApp check in local test mode, and its status while waiting. */
  const serveVerification = (status = 'pending') => {
    routes['/api/v1/verify'] = json(
      { success: true, data: { id: VERIFICATION_ID, code: '123456', mode: 'dev' } },
      201,
    );
    routes[`/api/v1/verify/${VERIFICATION_ID}/confirm`] = json({
      success: true,
      data: { status: 'verified' },
    });
    routes[`/api/v1/verify/${VERIFICATION_ID}`] = json({ success: true, data: { status } });
  };
  const fillIn = () => {
    type('Full name', 'Ali Khan');
    type('Mobile number', '0300 1234567');
    type('Password', 'longenough1');
  };
  const verify = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Verify number on WhatsApp' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pretend I sent it' }));
    await screen.findByText('03001234567 is verified');
  };

  it('validates password length and phone format', async () => {
    renderWithProviders(<SignupForm next="/" />);
    type('Full name', 'Ali Khan');
    type('Password', 'short');
    type('Mobile number', '123');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText(/valid mobile number/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('offers the WhatsApp check only once the number is complete', () => {
    renderWithProviders(<SignupForm next="/" />);
    type('Mobile number', '0300123');
    expect(screen.queryByRole('button', { name: 'Verify number on WhatsApp' })).toBeNull();
    type('Mobile number', '03001234567');
    expect(screen.getByRole('button', { name: 'Verify number on WhatsApp' })).toBeInTheDocument();
  });

  it('will not create the account until the number is verified', async () => {
    renderWithProviders(<SignupForm next="/" />);
    fillIn();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Verify this number on WhatsApp first')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/api/auth/signup')).toBe(false);
  });

  it('creates the account with the proven number and no email, then redirects', async () => {
    serveVerification();
    routes['/api/auth/signup'] = json({ success: true, data: { user: {} } }, 201);
    renderWithProviders(<SignupForm next="/" />);
    fillIn();
    await verify();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/');
    });
    expect(sentBody('/api/v1/verify')).toEqual({ phone: '03001234567' });
    expect(sentBody('/api/auth/signup')).toEqual({
      name: 'Ali Khan',
      phone: '03001234567',
      password: 'longenough1',
      verificationId: VERIFICATION_ID,
    });
  });

  it('notices on its own when the WhatsApp message has arrived', async () => {
    serveVerification('verified');
    renderWithProviders(<SignupForm next="/" pollMs={20} />);
    fillIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify number on WhatsApp' }));
    expect(await screen.findByText('123456')).toBeInTheDocument();
    expect(await screen.findByText('03001234567 is verified')).toBeInTheDocument();
  });

  it('offers a new code once the old one has expired', async () => {
    serveVerification('expired');
    renderWithProviders(<SignupForm next="/" pollMs={20} />);
    fillIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify number on WhatsApp' }));
    expect(await screen.findByText('The code has expired.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get a new code' })).toBeInTheDocument();
  });

  it('shows why the check could not start', async () => {
    routes['/api/v1/verify'] = json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Too many tries.' } },
      429,
    );
    renderWithProviders(<SignupForm next="/" />);
    fillIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify number on WhatsApp' }));
    expect(await screen.findByText('Too many tries.')).toBeInTheDocument();
  });

  it('shows a taken number from the server under the phone field', async () => {
    serveVerification();
    routes['/api/auth/signup'] = json(
      {
        success: false,
        error: {
          code: 'PHONE_TAKEN',
          message: 'An account with this phone number already exists.',
          details: { phone: 'An account with this phone number already exists' },
        },
      },
      409,
    );
    renderWithProviders(<SignupForm next="/" />);
    fillIn();
    await verify();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('An account with this phone number already exists'),
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
      data: { user: { userId: 'u', phone: '03001234567', role: 'CUSTOMER' } },
    });
    routes['/api/auth/logout'] = json({ success: true, data: null });
    renderWithProviders(<AuthMenu />);

    expect(await screen.findByText('03001234567')).toBeInTheDocument();
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
    type('Mobile number', '03000000002');
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
