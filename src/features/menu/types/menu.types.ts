/** Plain, serializable shapes for the public site (money is a number of rupees, not Decimal). */

export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'LIMITED';

export interface MenuProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categorySlug: string;
  /** Price the customer pays before options: discount price when set, else base price. */
  price: number;
  /** Struck-through price, only present when there is a discount. */
  originalPrice: number | null;
  thumbnailUrl: string | null;
  preparationTime: number;
  isFeatured: boolean;
  isPopular: boolean;
  /** False when hidden by staff or out of stock. Such items are shown but cannot be ordered. */
  orderable: boolean;
  stockStatus: StockStatus;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  products: MenuProduct[];
}

export interface VariantOption {
  id: string;
  name: string;
  priceModifier: number;
}

export interface VariantGroup {
  id: string;
  name: string;
  isRequired: boolean;
  variants: VariantOption[];
}

export interface AddonOption {
  id: string;
  name: string;
  price: number;
}

export interface ProductDetail extends MenuProduct {
  categoryName: string;
  images: { url: string; alt: string }[];
  variantGroups: VariantGroup[];
  addons: AddonOption[];
}

export interface DealItemSummary {
  productName: string;
  variantName: string | null;
  quantity: number;
}

export interface DealSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  /** What the same items cost bought separately, used to show the saving. */
  originalPrice: number;
  isFeatured: boolean;
  endsAt: string | null;
  items: DealItemSummary[];
}
