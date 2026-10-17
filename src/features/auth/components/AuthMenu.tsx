'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { postJson } from '@/shared/utils/api';
import { SESSION_QUERY_KEY, useSession } from '../hooks/useSession';

/**
 * Lives in the header. It asks the API who is signed in instead of reading cookies on the
 * server, so the layout stays static and public pages can be cached.
 */
export function AuthMenu() {
  const t = useTranslations('header');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isPending } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await postJson('/api/auth/logout');
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    setLoggingOut(false);
    router.push('/');
    router.refresh();
  }

  // Reserve the space so the header doesn't shift when the session resolves.
  if (isPending) return <Skeleton className="h-11 w-40" />;

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth/login"
          className="inline-flex min-h-11 items-center px-3 text-sm text-stone-300 hover:text-white"
        >
          {t('login')}
        </Link>
        <Link
          href="/auth/signup"
          className="bg-ember inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white hover:bg-orange-600"
        >
          {t('signup')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-40 truncate text-sm text-stone-300 sm:inline">
        {user.email}
      </span>
      <Button variant="secondary" loading={loggingOut} onClick={() => void logout()}>
        {loggingOut ? t('loggingOut') : t('logout')}
      </Button>
    </div>
  );
}
