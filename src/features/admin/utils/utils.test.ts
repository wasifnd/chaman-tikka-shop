import { describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_BYTES, uploadImage } from './upload';
import { applyApiError } from './api-errors';
import { formatAmount } from './format-amount';
import { formatKarachi } from './format-time';

describe('formatAmount', () => {
  it('shows whole rupees without decimals and paisa with two', () => {
    expect(formatAmount(349)).toBe('Rs. 349');
    expect(formatAmount(1350)).toBe('Rs. 1,350');
    expect(formatAmount(349.5)).toBe('Rs. 349.50');
    expect(formatAmount(0)).toBe('Rs. 0');
    expect(formatAmount(0.05)).toBe('Rs. 0.05');
  });
});

describe('formatKarachi', () => {
  it('shows the time in Karachi whatever the server clock', () => {
    // 16:00 UTC is 9 PM in Karachi.
    expect(formatKarachi('2026-10-17T16:00:00Z').toLowerCase()).toMatch(/9:00\s?pm/);
  });
  it('rolls over to the next day after 7 PM UTC', () => {
    expect(formatKarachi('2026-10-17T20:30:00Z')).toMatch(/18/);
  });
});

describe('applyApiError', () => {
  it('puts field messages under the matching fields and returns the general message', () => {
    const setError = vi.fn();
    const message = applyApiError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid.',
        details: {
          nameEn: 'Name is required',
          'variantGroups.0.nameEn': 'Two groups share this name',
        },
      },
      setError,
    );
    expect(message).toBe('Some fields are invalid.');
    expect(setError).toHaveBeenCalledWith('nameEn', { message: 'Name is required' });
    expect(setError).toHaveBeenCalledWith('variantGroups.0.nameEn', {
      message: 'Two groups share this name',
    });
  });

  it('works when the server gave no field details', () => {
    const setError = vi.fn();
    expect(applyApiError({ code: 'X', message: 'Nope' }, setError)).toBe('Nope');
    expect(setError).not.toHaveBeenCalled();
  });
});

describe('uploadImage', () => {
  const image = (size = 1000, type = 'image/png') =>
    new File([new Uint8Array(size)], 'photo.png', { type });
  const permit = {
    cloudName: 'demo',
    apiKey: 'k',
    timestamp: 1,
    folder: 'bbq-store',
    signature: 's',
  };

  const fetcherFor = (steps: (() => Response | Promise<Response>)[]) => {
    const calls: { url: string; init?: RequestInit | undefined }[] = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
      const step = steps.shift();
      if (!step) throw new Error('unexpected request');
      return Promise.resolve(step());
    }) as unknown as typeof fetch;
    return { fetcher, calls };
  };
  const signOk = () => Response.json({ success: true, data: permit });

  it('refuses a file that is not an image before sending anything', async () => {
    const { fetcher, calls } = fetcherFor([]);
    const result = await uploadImage(image(10, 'application/pdf'), fetcher);
    expect(result).toEqual({ ok: false, message: 'Choose an image file (JPG, PNG or WebP).' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a photo larger than 5 MB', async () => {
    const { fetcher, calls } = fetcherFor([]);
    const result = await uploadImage(image(MAX_UPLOAD_BYTES + 1), fetcher);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('gets a permit from our server then sends the photo straight to Cloudinary', async () => {
    const { fetcher, calls } = fetcherFor([
      signOk,
      () => Response.json({ secure_url: 'https://res.cloudinary.com/demo/image/upload/x.png' }),
    ]);
    const result = await uploadImage(image(), fetcher);
    expect(result).toEqual({ ok: true, url: 'https://res.cloudinary.com/demo/image/upload/x.png' });
    expect(calls[0]?.url).toBe('/api/v1/admin/uploads/sign');
    expect(calls[1]?.url).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    const form = calls[1]?.init?.body as FormData;
    expect(form.get('signature')).toBe('s');
    expect(form.get('api_key')).toBe('k');
    expect(form.get('timestamp')).toBe('1');
    expect(form.get('folder')).toBe('bbq-store');
    expect(form.get('file')).toBeInstanceOf(File);
    // The API secret is never part of what the browser sends.
    expect([...form.keys()]).not.toContain('api_secret');
  });

  it('explains when uploads are not set up', async () => {
    const { fetcher } = fetcherFor([
      () =>
        Response.json(
          {
            success: false,
            error: { code: 'UPLOADS_NOT_CONFIGURED', message: 'Photo upload is not set up yet.' },
          },
          { status: 503 },
        ),
    ]);
    expect(await uploadImage(image(), fetcher)).toEqual({
      ok: false,
      message: 'Photo upload is not set up yet.',
    });
  });

  it('copes with a permit that is not what was expected', async () => {
    const { fetcher } = fetcherFor([() => Response.json({ success: true, data: { nope: 1 } })]);
    const result = await uploadImage(image(), fetcher);
    expect(result.ok).toBe(false);
  });

  it('reports a Cloudinary refusal and a dropped connection', async () => {
    const refused = fetcherFor([
      signOk,
      () => Response.json({ error: { message: 'bad' } }, { status: 400 }),
    ]);
    expect((await uploadImage(image(), refused.fetcher)).ok).toBe(false);

    const noUrl = fetcherFor([signOk, () => Response.json({})]);
    expect((await uploadImage(image(), noUrl.fetcher)).ok).toBe(false);

    const dropped = fetcherFor([
      signOk,
      () => {
        throw new TypeError('network down');
      },
    ]);
    const result = await uploadImage(image(), dropped.fetcher);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toMatch(/connection/i);
  });
});
