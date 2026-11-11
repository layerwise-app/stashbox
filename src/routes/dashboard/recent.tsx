import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ClockIcon } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '~/components/ui/empty';
import { PageTitle } from '~/components/files/folder-view';
import { ItemBrowser } from '~/components/files/item-browser';
import { fileKeys } from '~/components/files/queries';
import { listRecent } from '~/server/files.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/recent')({
  head: () => seo({ title: 'Recent · Stashbox', noindex: true }),
  component: RecentPage
});

function RecentPage() {
  const query = useQuery({ queryKey: fileKeys.recent, queryFn: () => listRecent() });
  return (
    <ItemBrowser
      items={query.data}
      isLoading={query.isLoading}
      error={query.error}
      showLocation
      sortable={false}
      description='The last 50 files you uploaded or opened.'
      title={<PageTitle>Recent</PageTitle>}
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <ClockIcon />
            </EmptyMedia>
            <EmptyTitle>No recent files</EmptyTitle>
            <EmptyDescription>Files you upload or open show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
