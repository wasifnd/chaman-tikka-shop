'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';
import { ALL_CATEGORIES, filterMenu } from '../filter';
import type { MenuCategory } from '../types/menu.types';
import { ProductCard } from './ProductCard';

/**
 * The whole menu is small and already on the page, so searching and filtering happen in the
 * browser: instant, no server round trip, and the page itself stays static and cacheable.
 */
export function MenuBrowser({ categories }: { categories: MenuCategory[] }) {
  const t = useTranslations('menu');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [query, setQuery] = useState('');

  const visible = useMemo(
    () => filterMenu(categories, { category, query }),
    [categories, category, query],
  );
  const count = visible.reduce((sum, c) => sum + c.products.length, 0);
  const isFiltered = category !== ALL_CATEGORIES || query.trim() !== '';

  function reset() {
    setCategory(ALL_CATEGORIES);
    setQuery('');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label htmlFor="menu-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <input
          id="menu-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="bg-ash focus-visible:outline-ember min-h-11 w-full rounded-lg px-3 text-stone-100 ring-1 ring-stone-700 placeholder:text-stone-500 focus-visible:outline-2"
        />
        <div role="group" aria-label={t('categoryFilter')} className="flex flex-wrap gap-2">
          {[{ slug: ALL_CATEGORIES, name: t('allCategories') }, ...categories].map((item) => (
            <button
              key={item.slug}
              type="button"
              aria-pressed={category === item.slug}
              onClick={() => {
                setCategory(item.slug);
              }}
              className={cn(
                'focus-visible:outline-ember min-h-11 rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2',
                category === item.slug
                  ? 'bg-ember text-white'
                  : 'bg-ash text-stone-300 ring-1 ring-stone-700 hover:text-white',
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <p role="status" className="sr-only">
        {isFiltered ? t('resultsCount', { count }) : ''}
      </p>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="text-stone-300">{t('noResults')}</p>
          <Button variant="secondary" onClick={reset}>
            {t('clearFilters')}
          </Button>
        </div>
      ) : (
        visible.map((section, index) => (
          <section key={section.id} id={`category-${section.slug}`} className="scroll-mt-20">
            <h2 className="mb-3 text-xl font-bold">{section.name}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {section.products.map((product, i) => (
                <ProductCard key={product.id} product={product} priority={index === 0 && i < 2} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
