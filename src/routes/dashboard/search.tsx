import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SearchXIcon } from 'lucide-react';
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
import { searchItems } from '~/server/files.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/search')({
  validateSearch: (search: Record<string, unknown>): { q: string } => ({
    q: typeof search.q === 'string' ? search.q : ''
  }),
  head: () => seo({ title: 'Search · Stashbox', noindex: true }),
  component: SearchPage
});

function SearchPage() {
  const { q } = Route.useSearch();
  const query = useQuery({
    queryKey: fileKeys.search(q),
    queryFn: () => searchItems({ data: { q } }),
    placeholderData: keepPreviousData
  });
  return (
    <ItemBrowser
      items={query.data}
      isLoading={query.isLoading}
      error={query.error}
      showLocation
      title={<PageTitle>{q ? `Results for “${q}”` : 'Search'}</PageTitle>}
      description={
        query.data && q
          ? `${query.data.length} ${query.data.length === 1 ? 'item' : 'items'} across all folders`
          : undefined
      }
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>{q ? 'No results' : 'Search your files'}</EmptyTitle>
            <EmptyDescription>
              {q
                ? `Nothing named like “${q}” in your files. Check the spelling or try a shorter search.`
                : 'Type in the search box to find files and folders by name.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
