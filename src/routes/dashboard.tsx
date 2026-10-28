import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '~/components/ui/card';
import { getAuthSession } from '~/lib/auth.functions';
import { seo } from '~/utils/seo';

const createdAtFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short'
});

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const session = await getAuthSession();
    if (!session) {
      throw redirect({ to: '/sign-in' });
    }

    return { user: session.user };
  },
  head: () =>
    seo({
      title: 'Dashboard',
      description: 'View your account information',
      noindex: true
    }),
  component: DashboardPage
});

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const createdAt = createdAtFormatter.format(new Date(user.createdAt));

  return (
    <div className='min-h-[100dvh] bg-muted/30'>
      <header className='border-b bg-background'>
        <div className='container mx-auto flex h-16 items-center justify-between px-6 sm:px-8'>
          <Link to='/' className='font-semibold tracking-tight'>
            My App
          </Link>
          <Button variant='outline' asChild>
            <Link to='/'>Back home</Link>
          </Button>
        </div>
      </header>

      <main className='container mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16'>
        <div className='mb-8 space-y-2'>
          <h1 className='text-3xl font-semibold tracking-tight'>
            Your account
          </h1>
          <p className='text-muted-foreground'>
            The profile connected to your current session.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{user.name}</CardTitle>
            <CardDescription>Account information</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className='grid gap-6 sm:grid-cols-2'>
              <div className='space-y-1'>
                <dt className='text-sm text-muted-foreground'>Email</dt>
                <dd className='font-medium break-all'>{user.email}</dd>
              </div>
              <div className='space-y-1'>
                <dt className='text-sm text-muted-foreground'>Email status</dt>
                <dd>
                  <Badge variant={user.emailVerified ? 'secondary' : 'outline'}>
                    {user.emailVerified ? 'Verified' : 'Not verified'}
                  </Badge>
                </dd>
              </div>
              <div className='space-y-1 sm:col-span-2'>
                <dt className='text-sm text-muted-foreground'>Registered</dt>
                <dd className='font-medium'>{createdAt}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
