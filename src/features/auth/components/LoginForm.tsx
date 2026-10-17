'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { postJson } from '@/shared/utils/api';
import { loginSchema, type LoginFormValues, type LoginInput } from '../schemas/auth.schema';
import { SESSION_QUERY_KEY } from '../hooks/useSession';
import { splitApiError } from '../utils/api-errors';
import { postLoginPath, readRole } from '../utils/post-login';

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues, unknown, LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    const result = await postJson('/api/auth/login', values);
    if (!result.ok) {
      const { fieldErrors, formError: message } = splitApiError(result.error, [
        'email',
        'password',
      ]);
      for (const { name, message: text } of fieldErrors) {
        setError(name as keyof LoginFormValues, { message: text });
      }
      setFormError(message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    router.push(postLoginPath(readRole(result.data), next));
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      {formError ? <Alert>{formError}</Alert> : null}
      <Input
        label={t('email')}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label={t('password')}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submitLogin')}
      </Button>
      <p className="text-sm text-stone-400">
        {t('noAccount')}{' '}
        <Link href="/auth/signup" className="text-ember underline">
          {t('submitSignup')}
        </Link>
      </p>
    </form>
  );
}
