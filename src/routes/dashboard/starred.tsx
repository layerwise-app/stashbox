import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { StarIcon } from 'lucide-react';
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
import { listStarred } from '~/server/files.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/starred')({
  head: () => seo({ title: 'Starred · Stashbox', noindex: true }),
  component: StarredPage
});

function StarredPage() {
  const query = useQuery({ queryKey: fileKeys.starred, queryFn: () => listStarred() });
  return (
    <ItemBrowser
      items={query.data}
      isLoading={query.isLoading}
      error={query.error}
      showLocation
      description='Files and folders you starred, wherever they are.'
      title={<PageTitle>Starred</PageTitle>}
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <StarIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing starred yet</EmptyTitle>
            <EmptyDescription>Star files and folders to keep them one click away.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
