import { cloudinaryConfig } from './logic/cloudinary';

/** Whether photo upload is set up, so forms know whether to offer the Upload button. */
export const uploadsEnabled = (): boolean => cloudinaryConfig(process.env) !== null;
