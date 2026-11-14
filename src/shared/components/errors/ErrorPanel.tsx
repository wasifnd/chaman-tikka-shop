'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { errorReference } from '@/shared/utils/error-reference';

export interface ErrorPanelProps {
  /** What was thrown, used only for the reference code and the log. */
  error: unknown;
  /** Asks Next to fetch and draw the broken part again. */
  retry: () => void;
  /** Which message set to use: the public site, the store panel or the admin panel. */
  area: 'site' | 'store' | 'admin';
  /** Where "go back" leads. */
  homeHref: string;
}

/**
 * What a visitor sees when a page breaks: plain words, a way to try again, a way out, and a short
 * reference code to quote if it keeps happening. Never shows the technical message.
 */
export function ErrorPanel({ error, retry, area, homeHref }: ErrorPanelProps) {
  const t = useTranslations(`errors.${area}`);
  const common = useTranslations('errors');
  const heading = useRef<HTMLHeadingElement>(null);
  const reference = errorReference(error);

  useEffect(() => {
    // Whoever runs the site finds the details in the server log (matched by the reference code).
    console.error(error);
    // Move focus to the message so keyboard and screen-reader users notice the change.
    heading.current?.focus();
  }, [error]);

  return (
    <main
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16"
      role="alert"
    >
      <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold outline-none">
        {t('title')}
      </h1>
      <p className="text-stone-400">{t('body')}</p>
      {reference ? (
        <p className="text-sm text-stone-500">{common('reference', { code: reference })}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button onClick={retry}>{common('retry')}</Button>
        <Link
          href={homeHref}
          className="focus-visible:outline-gold inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-stone-300 ring-1 ring-stone-700 hover:text-white focus-visible:outline-2"
        >
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
