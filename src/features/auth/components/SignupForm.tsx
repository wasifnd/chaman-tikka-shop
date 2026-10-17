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
import { signupSchema, type SignupFormValues, type SignupInput } from '../schemas/auth.schema';
import { SESSION_QUERY_KEY } from '../hooks/useSession';
import { splitApiError } from '../utils/api-errors';

const FIELDS = ['name', 'email', 'password', 'phone'] as const;

export function SignupForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues, unknown, SignupInput>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupInput) {
    setFormError(null);
    const result = await postJson('/api/auth/signup', values);
    if (!result.ok) {
      const { fieldErrors, formError: message } = splitApiError(result.error, FIELDS);
      for (const { name, message: text } of fieldErrors) {
        setError(name as keyof SignupFormValues, { message: text });
      }
      setFormError(message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    router.push(next);
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
        label={t('name')}
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
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
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Input
        label={t('phone')}
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? t('submitting') : t('submitSignup')}
      </Button>
      <p className="text-sm text-stone-400">
        {t('haveAccount')}{' '}
        <Link href="/auth/login" className="text-ember underline">
          {t('submitLogin')}
        </Link>
      </p>
    </form>
  );
}
