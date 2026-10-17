'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Role } from '@/lib/auth/roles';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Select } from '@/shared/components/ui/Select';
import { useAdminApi } from '../hooks/useAdminApi';
import { canManageMember } from '../logic/team-rules';
import {
  teamCreateSchema,
  type TeamCreateFormValues,
  type TeamCreateInput,
} from '../schemas/operations.schema';
import type { TeamMember } from '../types/admin.types';
import { applyApiError } from '../utils/api-errors';
import { AdminForm } from './form-parts';

function NewMemberForm({ canMakeAdmin, onDone }: { canMakeAdmin: boolean; onDone: () => void }) {
  const t = useTranslations('admin.team');
  const api = useAdminApi();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamCreateFormValues, unknown, TeamCreateInput>({
    resolver: zodResolver(teamCreateSchema),
    defaultValues: { email: '', role: 'STORE_STAFF', password: '' },
  });

  async function onSubmit(values: TeamCreateInput) {
    setFormError(null);
    const result = await api('POST', '/api/v1/admin/team', values);
    if (result.ok) onDone();
    else setFormError(applyApiError(result.error, setError));
  }

  return (
    <AdminForm
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      formError={formError}
      saving={isSubmitting}
      onCancel={onDone}
    >
      <Input
        label={t('email')}
        type="email"
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />
      <Select label={t('role')} error={errors.role?.message} {...register('role')}>
        <option value="STORE_STAFF">{t('roles.STORE_STAFF')}</option>
        {canMakeAdmin ? <option value="ADMIN">{t('roles.ADMIN')}</option> : null}
      </Select>
      <Input
        label={t('password')}
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <p className="text-xs text-stone-500">{t('passwordHint')}</p>
    </AdminForm>
  );
}

function ResetPasswordForm({ member, onDone }: { member: TeamMember; onDone: () => void }) {
  const t = useTranslations('admin.team');
  const common = useTranslations('admin.common');
  const api = useAdminApi();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await api('PATCH', `/api/v1/admin/team/${member.id}`, { password });
    setSaving(false);
    if (result.ok) onDone();
    else setError(result.error.details?.['password'] ?? result.error.message);
  }

  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error ? <Alert>{error}</Alert> : null}
      <Input
        label={t('newPasswordFor', { email: member.email })}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {t('setPassword')}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={saving}>
          {common('cancel')}
        </Button>
      </div>
    </form>
  );
}

export function TeamManager({
  members,
  currentUserId,
  currentRole,
}: {
  members: TeamMember[];
  currentUserId: string;
  currentRole: Role;
}) {
  const t = useTranslations('admin.team');
  const api = useAdminApi();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setActive(member: TeamMember, isActive: boolean) {
    setError(null);
    const result = await api('PATCH', `/api/v1/admin/team/${member.id}`, { isActive });
    if (!result.ok) setError(result.error.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-400">{t('intro')}</p>
      {error ? <Alert>{error}</Alert> : null}
      {adding ? (
        <NewMemberForm
          canMakeAdmin={currentRole === 'SUPER_ADMIN'}
          onDone={() => {
            setAdding(false);
          }}
        />
      ) : (
        <div>
          <Button
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('add')}
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {members.map((member) => {
          const you = member.id === currentUserId;
          const canManage =
            canManageMember({ id: currentUserId, role: currentRole }, member) === 'ok';
          return (
            <li
              key={member.id}
              className="bg-ash flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-stone-800"
            >
              <div>
                <p className="font-semibold">
                  {member.email}
                  {you ? <span className="text-ember ml-2 text-sm">{t('you')}</span> : null}
                </p>
                <p className="text-sm text-stone-400">
                  {t(`roles.${member.role}`)} · {member.isActive ? t('active') : t('switchedOff')}
                  {' · '}
                  {member.lastLoginAt
                    ? t('lastSignIn', {
                        date: new Date(member.lastLoginAt).toLocaleString('en-PK'),
                      })
                    : t('neverSignedIn')}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    aria-label={
                      member.isActive
                        ? t('switchOffLabel', { email: member.email })
                        : t('switchOnLabel', { email: member.email })
                    }
                    onClick={() => void setActive(member, !member.isActive)}
                  >
                    {member.isActive ? t('switchOff') : t('switchOn')}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t('resetLabel', { email: member.email })}
                    onClick={() => {
                      setResetting(member.id);
                    }}
                  >
                    {t('resetPassword')}
                  </Button>
                </div>
              ) : null}
              {resetting === member.id ? (
                <ResetPasswordForm
                  member={member}
                  onDone={() => {
                    setResetting(null);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
