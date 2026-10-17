// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DealCard } from '@/features/deals/components/DealCard';
import messages from '@/i18n/messages/en.json';
import { FoodImage } from '@/shared/components/ui/FoodImage';
import { MenuBrowser } from './MenuBrowser';
import { ProductCard } from './ProductCard';
import { ProductOptions } from './ProductOptions';
import type { DealSummary, MenuCategory, MenuProduct, ProductDetail } from '../types/menu.types';

afterEach(cleanup);

const ui = (element: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );

const product = (overrides: Partial<MenuProduct> = {}): MenuProduct => ({
  id: 'p1',
  slug: 'chicken-tikka',
  name: 'Chicken Tikka',
  description: 'Char-grilled',
  categorySlug: 'chicken',
  price: 350,
  originalPrice: null,
  thumbnailUrl: null,
  preparationTime: 15,
  isFeatured: false,
  isPopular: false,
  orderable: true,
  stockStatus: 'IN_STOCK',
  ...overrides,
});

const categories: MenuCategory[] = [
  {
    id: 'c1',
    slug: 'chicken',
    name: 'Chicken',
    description: null,
    imageUrl: null,
    isFeatured: false,
    products: [product(), product({ id: 'p2', slug: 'malai-boti', name: 'Malai Boti' })],
  },
  {
    id: 'c2',
    slug: 'bread',
    name: 'Bread',
    description: null,
    imageUrl: null,
    isFeatured: false,
    products: [product({ id: 'p3', slug: 'naan', name: 'Naan', categorySlug: 'bread', price: 30 })],
  },
];

describe('MenuBrowser', () => {
  it('shows every category and product at first', () => {
    ui(<MenuBrowser categories={categories} />);
    expect(screen.getByRole('heading', { name: 'Chicken', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bread', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('filters by category and marks the active chip', () => {
    ui(<MenuBrowser categories={categories} />);
    const bread = screen.getByRole('button', { name: 'Bread' });
    fireEvent.click(bread);
    expect(bread).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('heading', { name: 'Chicken', level: 2 })).toBeNull();
    expect(screen.getByRole('link', { name: /Naan/ })).toBeInTheDocument();
  });

  it('searches as you type', () => {
    ui(<MenuBrowser categories={categories} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the menu' }), {
      target: { value: 'malai' },
    });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Malai Boti/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 item found');
  });

  it('offers a way back when nothing matches', () => {
    ui(<MenuBrowser categories={categories} />);
    const search = screen.getByRole('searchbox', { name: 'Search the menu' });
    fireEvent.change(search, { target: { value: 'pizza' } });
    expect(screen.getByText('Nothing matches your search.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(search).toHaveValue('');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});

describe('ProductCard', () => {
  it('links to the product with its price', () => {
    ui(
      <ul>
        <ProductCard product={product()} />
      </ul>,
    );
    expect(screen.getByRole('link', { name: /Chicken Tikka/ })).toHaveAttribute(
      'href',
      '/menu/chicken-tikka',
    );
    expect(screen.getByText('Rs. 350')).toBeInTheDocument();
  });

  it('shows discount, popular and stock badges', () => {
    ui(
      <ul>
        <ProductCard
          product={product({ originalPrice: 400, isPopular: true, stockStatus: 'LIMITED' })}
        />
        <ProductCard product={product({ id: 'x', name: 'Gone', orderable: false })} />
      </ul>,
    );
    expect(screen.getByText('Rs. 400')).toBeInTheDocument();
    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.getByText('Limited stock')).toBeInTheDocument();
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });
});

describe('ProductOptions', () => {
  const detail: ProductDetail = {
    ...product(),
    categoryName: 'Chicken',
    images: [],
    variantGroups: [
      {
        id: 'portion',
        name: 'Portion',
        isRequired: true,
        variants: [
          { id: 'quarter', name: 'Quarter', priceModifier: 0 },
          { id: 'full', name: 'Full', priceModifier: 650 },
        ],
      },
      {
        id: 'spice',
        name: 'Spice',
        isRequired: false,
        variants: [{ id: 'hot', name: 'Hot', priceModifier: 20 }],
      },
    ],
    addons: [{ id: 'raita', name: 'Raita', price: 50 }],
  };

  it('asks for required choices until they are made', () => {
    ui(<ProductOptions product={detail} />);
    expect(screen.getByText('Choose: Portion')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Quarter/));
    expect(screen.queryByText(/Choose:/)).toBeNull();
  });

  it('updates the total for variants and add-ons', () => {
    ui(<ProductOptions product={detail} />);
    const total = () => within(screen.getByText('Total').parentElement as HTMLElement);
    expect(total().getByText('Rs. 350')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Full/));
    fireEvent.click(screen.getByLabelText(/Raita/));
    expect(total().getByText('Rs. 1,050')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Raita/));
    expect(total().getByText('Rs. 1,000')).toBeInTheDocument();
  });

  it('lets optional groups be cleared with None', () => {
    ui(<ProductOptions product={detail} />);
    fireEvent.click(screen.getByLabelText(/Hot/));
    expect(screen.getByText('Rs. 370')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('None'));
    expect(screen.getByText('Rs. 350')).toBeInTheDocument();
  });

  it('explains when the item cannot be ordered', () => {
    ui(<ProductOptions product={{ ...detail, orderable: false }} />);
    expect(screen.getByText('This item is not available right now.')).toBeInTheDocument();
    expect(screen.queryByText(/Choose:/)).toBeNull();
  });

  it('renders without option groups at all', () => {
    ui(<ProductOptions product={{ ...detail, variantGroups: [], addons: [] }} />);
    expect(screen.getByText('Rs. 350')).toBeInTheDocument();
  });
});

describe('DealCard', () => {
  const deal: DealSummary = {
    id: 'd1',
    slug: 'family-platter',
    name: 'Family Platter',
    description: 'Feeds four',
    imageUrl: null,
    price: 1500,
    originalPrice: 2000,
    isFeatured: true,
    endsAt: null,
    items: [],
  };

  it('shows the saving when the bundle is cheaper', () => {
    ui(
      <ul>
        <DealCard deal={deal} />
      </ul>,
    );
    expect(screen.getByRole('link', { name: /Family Platter/ })).toHaveAttribute(
      'href',
      '/deals/family-platter',
    );
    expect(screen.getByText('Rs. 1,500')).toBeInTheDocument();
    expect(screen.getByText('Rs. 2,000')).toBeInTheDocument();
    expect(screen.getByText('Save 25%')).toBeInTheDocument();
  });

  it('hides the saving when there is none', () => {
    ui(
      <ul>
        <DealCard deal={{ ...deal, originalPrice: 1500 }} />
      </ul>,
    );
    expect(screen.queryByText(/Save/)).toBeNull();
  });
});

describe('FoodImage', () => {
  it('shows a placeholder initial without a photo', () => {
    const { container } = render(<FoodImage src={null} name="naan" sizes="100vw" />);
    expect(container.textContent).toBe('N');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the photo with alt text when there is one', () => {
    render(<FoodImage src="https://res.cloudinary.com/x/a.jpg" name="Naan" sizes="100vw" />);
    expect(screen.getByRole('img', { name: 'Naan' })).toBeInTheDocument();
  });
});
