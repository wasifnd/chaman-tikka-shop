import { requestJson } from '@/shared/utils/api';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

interface Signature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

const isSignature = (value: unknown): value is Signature =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Signature).cloudName === 'string' &&
  typeof (value as Signature).signature === 'string';

/**
 * Uploads a photo straight from the browser to Cloudinary using a short-lived signature from our
 * server. Checks the file first so an obviously wrong file never leaves the device.
 */
export async function uploadImage(
  file: File,
  fetcher: typeof fetch = fetch,
): Promise<UploadResult> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, message: 'Choose an image file (JPG, PNG or WebP).' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: 'That photo is larger than 5 MB. Choose a smaller one.' };
  }

  const signed = await requestJson('POST', '/api/v1/admin/uploads/sign', undefined, fetcher);
  if (!signed.ok) return { ok: false, message: signed.error.message };
  if (!isSignature(signed.data)) {
    return { ok: false, message: 'Could not prepare the upload. Please try again.' };
  }
  const { cloudName, apiKey, timestamp, folder, signature } = signed.data;

  const form = new FormData();
  form.set('file', file);
  form.set('api_key', apiKey);
  form.set('timestamp', String(timestamp));
  form.set('folder', folder);
  form.set('signature', signature);

  try {
    const response = await fetcher(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    const body = (await response.json()) as { secure_url?: unknown };
    if (!response.ok || typeof body.secure_url !== 'string') {
      return { ok: false, message: 'The photo could not be uploaded. Please try again.' };
    }
    return { ok: true, url: body.secure_url };
  } catch {
    return { ok: false, message: 'Could not reach the photo service. Check your connection.' };
  }
}
