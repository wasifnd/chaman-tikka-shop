/**
 * Cache tags for public data. Admin routes (a later phase) call
 * revalidateTag(MENU_TAG, { expire: 0 }) after editing so customers see changes at once.
 */
export const MENU_TAG = 'menu';
export const DEALS_TAG = 'deals';

/** Menu changes rarely: serve cached for an hour, refresh in the background. */
export const MENU_REVALIDATE_SECONDS = 3600;
/** Deals have start/end times, so keep them fresher. Checkout re-validates them anyway. */
export const DEALS_REVALIDATE_SECONDS = 300;
