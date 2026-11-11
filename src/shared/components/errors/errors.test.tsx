// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminError from '@/app/admin/error';
import GlobalError from '@/app/global-error';
import SiteError from '@/app/error';
import StoreError from '@/app/store/error';
import messages from '@/i18n/messages/en.json';
import { ErrorPanel } from './ErrorPanel';

const logged = vi.spyOn(console, 'error');
beforeEach(() => {
  logged.mockReset();
  logged.mockImplementation(() => undefined);
});
afterEach(cleanup);

const serverError = () => Object.assign(new Error('secret database detail'), { digest: 'abc123' });

const show = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe('ErrorPanel', () => {
  it('says plainly that something went wrong and never shows the technical message', () => {
    show(<ErrorPanel error={serverError()} retry={() => undefined} area="site" homeHref="/menu" />);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.queryByText(/secret database detail/)).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the reference code to quote when the server gave one', () => {
    show(<ErrorPanel error={serverError()} retry={() => undefined} area="site" homeHref="/menu" />);
    expect(screen.getByText(/Reference: abc123/)).toBeInTheDocument();
  });

  it('shows no reference for browser errors or odd values', () => {
    show(<ErrorPanel error="boom" retry={() => undefined} area="site" homeHref="/menu" />);
    expect(screen.queryByText(/Reference:/)).toBeNull();
  });

  it('lets the visitor try again, and offers a way out', () => {
    const retry = vi.fn();
    show(<ErrorPanel error={serverError()} retry={retry} area="site" homeHref="/menu" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Back to the menu' })).toHaveAttribute('href', '/menu');
  });

  it('records the error for whoever runs the site, and moves focus to the message', () => {
    const error = serverError();
    show(<ErrorPanel error={error} retry={() => undefined} area="site" homeHref="/menu" />);
    expect(logged).toHaveBeenCalledWith(error);
    expect(screen.getByRole('heading')).toHaveFocus();
  });
});

describe('the error pages', () => {
  it('the public site goes back to the menu', () => {
    show(<SiteError error={serverError()} retry={() => undefined} />);
    expect(screen.getByRole('link', { name: 'Back to the menu' })).toHaveAttribute('href', '/menu');
  });

  it('the store panel reassures staff that orders are safe and goes back to orders', () => {
    show(<StoreError error={serverError()} retry={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'The panel hit a problem' })).toBeInTheDocument();
    expect(screen.getByText(/Orders are safe/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to orders' })).toHaveAttribute(
      'href',
      '/store/orders',
    );
  });

  it('the admin panel says nothing was half-saved and goes back to the dashboard', () => {
    show(<AdminError error={serverError()} retry={() => undefined} />);
    expect(screen.getByText(/Nothing was lost or half-saved/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});

describe('GlobalError (the whole page frame failed)', () => {
  it('is a complete document that needs no styles or language files', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={serverError()} retry={() => undefined} />,
    );
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<body');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Reference: abc123');
    expect(html).toContain('Try again');
    expect(html).not.toContain('secret database detail');
  });

  it('leaves out the reference when there is none', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('x')} retry={() => undefined} />,
    );
    expect(html).not.toContain('Reference:');
  });
});
