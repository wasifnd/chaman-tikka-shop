import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PageTitle } from '@/features/admin/components/PageTitle';
import { TeamManager } from '@/features/admin/components/TeamManager';
import { operations } from '@/features/admin/server';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Admin team' };

export default async function AdminTeamPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?next=/admin/team');

  const [t, members] = await Promise.all([getTranslations('admin.team'), operations.listTeam()]);
  return (
    <>
      <PageTitle title={t('title')} />
      <TeamManager members={members} currentUserId={session.userId} currentRole={session.role} />
    </>
  );
}
