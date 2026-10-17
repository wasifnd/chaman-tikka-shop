'use client';

import { useTranslations } from 'next-intl';
import { useState, type SubmitEventHandler, type ReactNode } from 'react';
import { Alert } from '@/shared/components/ui/Alert';
import { Button } from '@/shared/components/ui/Button';
import { Input, type InputProps } from '@/shared/components/ui/Input';
import { isoToKarachiLocal, karachiLocalToIso } from '../logic/karachi-time';
import { uploadImage } from '../utils/upload';

/** Shared frame for every admin form: general error, Save and Cancel. */
export function AdminForm({
  onSubmit,
  formError,
  saving,
  onCancel,
  children,
}: {
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  formError: string | null;
  saving: boolean;
  onCancel?: (() => void) | undefined;
  children: ReactNode;
}) {
  const t = useTranslations('admin.common');
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="bg-ash/50 flex flex-col gap-4 rounded-xl p-4 ring-1 ring-stone-800"
    >
      {formError ? <Alert>{formError}</Alert> : null}
      {children}
      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Delete with a second tap, so a slip of the finger never removes something. */
export function DeleteButton({
  onConfirm,
  disabled = false,
  label,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  /** Names what is being deleted, for screen readers (e.g. "Delete Naan"). */
  label: string;
}) {
  const t = useTranslations('admin.common');
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button
        variant="ghost"
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          setAsking(true);
        }}
      >
        {t('delete')}
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="secondary"
        aria-label={t('confirmDeleteLabel', { name: label })}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {t('confirmDelete')}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setAsking(false);
        }}
      >
        {t('cancel')}
      </Button>
    </span>
  );
}

/** A date and time typed in Karachi time, kept in the form as an exact instant (or nothing). */
export function DateTimeField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  error?: string | undefined;
}) {
  const t = useTranslations('admin.common');
  return (
    <div className="flex flex-col gap-1">
      <Input
        label={`${label} (${t('karachiTime')})`}
        type="datetime-local"
        value={value ? isoToKarachiLocal(value) : ''}
        error={error}
        onChange={(event) => {
          const typed = event.target.value;
          onChange(typed ? karachiLocalToIso(typed) : null);
        }}
      />
    </div>
  );
}

/** A photo address field, with an optional "Upload" button when Cloudinary is set up. */
export function ImageField({
  inputProps,
  onUploaded,
  uploadsEnabled,
  error,
}: {
  inputProps: Omit<InputProps, 'label' | 'error'>;
  onUploaded: (url: string) => void;
  uploadsEnabled: boolean;
  error?: string | undefined;
}) {
  const t = useTranslations('admin.common');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadImage(file);
    setUploading(false);
    if (result.ok) onUploaded(result.url);
    else setUploadError(result.message);
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={t('imageAddress')}
        type="url"
        placeholder="https://res.cloudinary.com/..."
        error={error}
        {...inputProps}
      />
      {uploadsEnabled ? (
        <label className="flex flex-col gap-1 text-sm text-stone-300">
          {uploading ? t('uploading') : t('uploadPhoto')}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      ) : (
        <p className="text-xs text-stone-500">{t('uploadsOff')}</p>
      )}
      {uploadError ? <Alert>{uploadError}</Alert> : null}
    </div>
  );
}
