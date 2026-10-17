import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cloudinaryConfig, signUpload } from './cloudinary';

describe('signUpload', () => {
  const config = { cloudName: 'demo', apiKey: 'key123', apiSecret: 'topsecret' };

  it('signs the sorted parameters followed by the secret with SHA-1', () => {
    const result = signUpload(config, 1_700_000_000);
    const expected = createHash('sha1')
      .update('folder=bbq-store&timestamp=1700000000topsecret')
      .digest('hex');
    expect(result.signature).toBe(expected);
    expect(result).toMatchObject({ cloudName: 'demo', apiKey: 'key123', timestamp: 1_700_000_000 });
  });

  it('never reveals the secret', () => {
    expect(JSON.stringify(signUpload(config, 1))).not.toContain('topsecret');
  });

  it('gives a different signature for a different time', () => {
    expect(signUpload(config, 1).signature).not.toBe(signUpload(config, 2).signature);
  });
});

describe('cloudinaryConfig', () => {
  it('needs all three settings', () => {
    expect(
      cloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: 'c',
        CLOUDINARY_API_KEY: 'k',
        CLOUDINARY_API_SECRET: 's',
      }),
    ).toEqual({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k' })).toBeNull();
    expect(cloudinaryConfig({})).toBeNull();
  });
});
