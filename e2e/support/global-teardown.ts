import { ADMIN, signedIn } from './client';
import { clearWorld, loadWorld } from './world';

/**
 * Puts the restaurant back as it was: original hours and settings, and the scenarios' own menu,
 * area and coupons removed. Anything that has been ordered cannot be deleted (past orders still
 * point at it), so that is hidden instead, which is what the admin screens do too.
 */
export default async function globalTeardown() {
  let world;
  try {
    world = loadWorld();
  } catch {
    return;
  }
  const admin = await signedIn(ADMIN);

  const settings = world.original.settings as { restaurant: unknown; hours: unknown };
  await admin.put('/api/v1/admin/settings', {
    restaurant: settings.restaurant,
    hours: settings.hours,
  });

  await admin.del(`/api/v1/admin/deals/${world.dealId}`);
  await admin.del(`/api/v1/admin/zones/${world.zone.id}`);
  const coupons = await admin.get('/api/v1/admin/coupons');
  for (const coupon of (coupons.data as { coupons: { id: string; code: string }[] }).coupons) {
    if (coupon.code.includes(world.suffix.toUpperCase())) {
      await admin.del(`/api/v1/admin/coupons/${coupon.id}`);
    }
  }

  for (const id of [world.kabab.id, world.naan.id]) {
    const removed = await admin.del(`/api/v1/admin/products/${id}`);
    if (removed.status === 409) await hideProduct(id);
  }
  await admin.del(`/api/v1/admin/addons/${world.chutneyId}`);

  const gone = await admin.del(`/api/v1/admin/categories/${world.categoryId}`);
  if (gone.status === 409) {
    const categories = await admin.get('/api/v1/admin/categories');
    const category = (
      categories.data as { categories: { id: string; sortOrder: number; nameEn: string }[] }
    ).categories.find((c) => c.id === world.categoryId);
    if (category) {
      await admin.patch(`/api/v1/admin/categories/${world.categoryId}`, {
        nameEn: category.nameEn,
        descriptionEn: '',
        imageUrl: '',
        sortOrder: category.sortOrder,
        isActive: false,
        isFeatured: false,
      });
    }
  }

  clearWorld();
  await admin.dispose();

  async function hideProduct(id: string) {
    const current = await admin.get(`/api/v1/admin/products/${id}`);
    const product = (current.data as { product: Record<string, unknown> } | null)?.product;
    if (product) {
      await admin.patch(`/api/v1/admin/products/${id}`, { ...product, isActive: false });
    }
  }
}
