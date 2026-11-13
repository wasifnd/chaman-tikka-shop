'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { PhoneVerification } from '@/features/verification/components/PhoneVerification';
import { normalizePhone } from '@/lib/validation/phone';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { postJson } from '@/shared/utils/api';
import { signupSchema, type SignupFormValues, type SignupInput } from '../schemas/auth.schema';
import { SESSION_QUERY_KEY } from '../hooks/useSession';
import { splitApiError } from '../utils/api-errors';

const FIELDS = ['name', 'phone', 'email', 'password'] as const;

export function SignupForm({ next, pollMs }: { next: string; pollMs?: number }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  // Which number was proven, and by which check: typing a different number needs a new check.
  const [proof, setProof] = useState<{ phone: string; id: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues, unknown, SignupInput>({ resolver: zodResolver(signupSchema) });

  const phone = normalizePhone(useWatch({ control, name: 'phone', defaultValue: '' }));
  const verified = phone !== null && proof?.phone === phone;
  const onVerified = useCallback(
    (id: string) => {
      if (phone) setProof({ phone, id });
      clearErrors('phone');
    },
    [phone, clearErrors],
  );

  async function onSubmit(values: SignupInput) {
    setFormError(null);
    if (proof?.phone !== values.phone) {
      setError('phone', { message: t('verifyFirst') });
      return;
    }
    const result = await postJson('/api/auth/signup', { ...values, verificationId: proof.id });
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
        label={t('phone')}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        hint={t('phoneHint')}
        error={errors.phone?.message}
        {...register('phone')}
      />
      {phone ? (
        <PhoneVerification
          key={phone}
          phone={phone}
          verified={verified}
          onVerified={onVerified}
          {...(pollMs ? { pollMs } : {})}
        />
      ) : null}
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
