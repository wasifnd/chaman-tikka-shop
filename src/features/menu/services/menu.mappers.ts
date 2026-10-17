import { effectivePrice } from '../pricing';
import type {
  DealSummary,
  MenuCategory,
  MenuProduct,
  ProductDetail,
  StockStatus,
  VariantGroup,
} from '../types/menu.types';

/** Anything Prisma's Decimal-like values satisfy: we only need to turn them into numbers. */
type Money = { toString(): string } | number;

export const toNumber = (value: Money): number => Number(value.toString());

export interface ProductRow {
  id: string;
  slug: string;
  nameEn: string;
  descriptionEn: string | null;
  category: { slug: string; nameEn: string };
  basePrice: Money;
  discountPrice: Money | null;
  thumbnailUrl: string | null;
  preparationTime: number;
  isFeatured: boolean;
  isPopular: boolean;
  isAvailable: boolean;
  stockStatus: StockStatus;
}

export function mapProduct(row: ProductRow): MenuProduct {
  const base = toNumber(row.basePrice);
  const discount = row.discountPrice === null ? null : toNumber(row.discountPrice);
  const price = effectivePrice(base, discount);
  return {
    id: row.id,
    slug: row.slug,
    name: row.nameEn,
    description: row.descriptionEn,
    categorySlug: row.category.slug,
    price,
    originalPrice: price < base ? base : null,
    thumbnailUrl: row.thumbnailUrl,
    preparationTime: row.preparationTime,
    isFeatured: row.isFeatured,
    isPopular: row.isPopular,
    orderable: row.isAvailable && row.stockStatus !== 'OUT_OF_STOCK',
    stockStatus: row.stockStatus,
  };
}

export interface CategoryRow {
  id: string;
  slug: string;
  nameEn: string;
  descriptionEn: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  products: Omit<ProductRow, 'category'>[];
}

export function mapCategory(row: CategoryRow): MenuCategory {
  const category = { slug: row.slug, nameEn: row.nameEn };
  return {
    id: row.id,
    slug: row.slug,
    name: row.nameEn,
    description: row.descriptionEn,
    imageUrl: row.imageUrl,
    isFeatured: row.isFeatured,
    products: row.products.map((product) => mapProduct({ ...product, category })),
  };
}

export interface ProductDetailRow extends ProductRow {
  images: { url: string; altTextEn: string | null }[];
  variantGroups: {
    id: string;
    nameEn: string;
    isRequired: boolean;
    variants: { id: string; nameEn: string; priceModifier: Money; isAvailable: boolean }[];
  }[];
  productAddons: { addon: { id: string; nameEn: string; price: Money; isAvailable: boolean } }[];
}

export function mapProductDetail(row: ProductDetailRow): ProductDetail {
  const variantGroups: VariantGroup[] = row.variantGroups
    .map((group) => ({
      id: group.id,
      name: group.nameEn,
      isRequired: group.isRequired,
      variants: group.variants
        .filter((variant) => variant.isAvailable)
        .map((variant) => ({
          id: variant.id,
          name: variant.nameEn,
          priceModifier: toNumber(variant.priceModifier),
        })),
    }))
    // A group with no available choices can't be filled in, so don't show it.
    .filter((group) => group.variants.length > 0);

  return {
    ...mapProduct(row),
    categoryName: row.category.nameEn,
    images: row.images.map((image) => ({ url: image.url, alt: image.altTextEn ?? row.nameEn })),
    variantGroups,
    addons: row.productAddons
      .filter(({ addon }) => addon.isAvailable)
      .map(({ addon }) => ({ id: addon.id, name: addon.nameEn, price: toNumber(addon.price) })),
  };
}

export interface DealRow {
  id: string;
  slug: string;
  nameEn: string;
  descriptionEn: string | null;
  imageUrl: string | null;
  price: Money;
  startDate: Date | null;
  endDate: Date | null;
  isFeatured: boolean;
  items: {
    quantity: number;
    product: { nameEn: string; basePrice: Money; discountPrice: Money | null };
    variant: { nameEn: string; priceModifier: Money } | null;
  }[];
}

/** A deal is shown only inside its (optional) start/end window. */
export function isDealLive(deal: Pick<DealRow, 'startDate' | 'endDate'>, now: Date): boolean {
  if (deal.startDate && deal.startDate > now) return false;
  if (deal.endDate && deal.endDate < now) return false;
  return true;
}

export function mapDeal(row: DealRow): DealSummary {
  const originalPrice = row.items.reduce((sum, item) => {
    const { basePrice, discountPrice } = item.product;
    const unit = discountPrice === null ? toNumber(basePrice) : toNumber(discountPrice);
    const modifier = item.variant ? toNumber(item.variant.priceModifier) : 0;
    return sum + (unit + modifier) * item.quantity;
  }, 0);

  return {
    id: row.id,
    slug: row.slug,
    name: row.nameEn,
    description: row.descriptionEn,
    imageUrl: row.imageUrl,
    price: toNumber(row.price),
    originalPrice,
    isFeatured: row.isFeatured,
    endsAt: row.endDate ? row.endDate.toISOString() : null,
    items: row.items.map((item) => ({
      productName: item.product.nameEn,
      variantName: item.variant?.nameEn ?? null,
      quantity: item.quantity,
    })),
  };
}
