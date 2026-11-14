import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ADMIN_ROLES } from '@/lib/auth/roles';
import { getSession } from '@/lib/auth/session';
import { KhataDetailView } from './components/KhataDetailView';
import { KhataList } from './components/KhataList';
import { listQuerySchema } from './schemas/khata.schema';
import { khataRepository } from './server';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The khata list page, shared by the store panel and the admin panel. */
export async function KhataListPage({
  searchParams,
  basePath,
}: {
  searchParams: SearchParams;
  basePath: string;
}) {
  const raw = await searchParams;
  const parsed = listQuerySchema.safeParse({
    q: first(raw['q']),
    all: first(raw['all']),
    page: first(raw['page']),
  });
  // A mangled link shows the plain list rather than an error.
  const query = parsed.success ? parsed.data : {};
  const [t, page] = await Promise.all([
    getTranslations('khata'),
    khataRepository.list({ search: query.q, owingOnly: !query.all, page: query.page }),
  ]);
  return (
    <>
      <h2 className="mb-1 text-xl font-semibold">{t('title')}</h2>
      <p className="mb-5 text-sm text-stone-400">{t('hint')}</p>
      <KhataList
        page={page}
        basePath={basePath}
        search={query.q ?? ''}
        showAll={Boolean(query.all)}
      />
    </>
  );
}

/** One khata, shared by the store panel and the admin panel. Admin also gets corrections. */
export async function KhataDetailPage({
  params,
  basePath,
}: {
  params: Promise<{ id: string }>;
  basePath: string;
}) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [khata, defaultLimit, session] = await Promise.all([
    khataRepository.findById(id.data),
    khataRepository.defaultLimit(),
    getSession(),
  ]);
  if (!khata) notFound();
  return (
    <KhataDetailView
      khata={khata}
      basePath={basePath}
      defaultLimit={defaultLimit}
      isAdmin={session !== null && ADMIN_ROLES.includes(session.role)}
    />
  );
}
