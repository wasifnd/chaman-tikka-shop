import { cloudinaryConfig, signUpload } from '@/features/admin/logic/cloudinary';
import { requireAdmin } from '@/features/admin/http';
import { AppError } from '@/lib/errors';
import { ok, route } from '@/lib/http/response';

/** Gives an admin's browser a one-minute permit to upload a photo straight to Cloudinary. */
export const POST = route(async (request: Request) => {
  await requireAdmin(request);
  const config = cloudinaryConfig(process.env);
  if (!config) {
    throw new AppError(
      'UPLOADS_NOT_CONFIGURED',
      'Photo upload is not set up yet. Paste an image address instead.',
      503,
    );
  }
  return ok(signUpload(config, Math.floor(Date.now() / 1000)));
});
