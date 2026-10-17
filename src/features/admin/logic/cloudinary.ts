import { createHash } from 'node:crypto';

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const FOLDER = 'bbq-store';

/**
 * Cloudinary signed uploads: the browser sends the file straight to Cloudinary with a signature we
 * make here, so the API secret never leaves the server and the file never passes through us.
 * The signed string is the sorted parameters followed by the secret, hashed with SHA-1.
 */
export function signUpload(config: CloudinaryConfig, nowSeconds: number): UploadSignature {
  const toSign = `folder=${FOLDER}&timestamp=${String(nowSeconds)}${config.apiSecret}`;
  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp: nowSeconds,
    folder: FOLDER,
    signature: createHash('sha1').update(toSign).digest('hex'),
  };
}

/** Reads the three Cloudinary settings, or null when uploads are not set up. */
export function cloudinaryConfig(
  source: Record<string, string | undefined>,
): CloudinaryConfig | null {
  const cloudName = source['CLOUDINARY_CLOUD_NAME'];
  const apiKey = source['CLOUDINARY_API_KEY'];
  const apiSecret = source['CLOUDINARY_API_SECRET'];
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}
