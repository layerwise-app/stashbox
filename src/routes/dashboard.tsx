import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { FileActionsProvider } from '~/components/files/actions';
import { AppShell } from '~/components/files/app-shell';
import { UploadProvider } from '~/components/files/uploads';
import { getAuthSession } from '~/lib/auth.functions';
import { getSidebarPrefs } from '~/server/account.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const [session, sidebar] = await Promise.all([getAuthSession(), getSidebarPrefs()]);
    if (!session) throw redirect({ to: '/sign-in' });
    return { user: session.user, sidebar };
  },
  head: () => seo({ title: 'Stashbox', noindex: true }),
  component: DashboardLayout
});

function DashboardLayout() {
  const { user, sidebar } = Route.useRouteContext();
  return (
    <UploadProvider>
      <FileActionsProvider>
        <AppShell user={user} sidebar={sidebar}>
          <Outlet />
        </AppShell>
      </FileActionsProvider>
    </UploadProvider>
  );
}
