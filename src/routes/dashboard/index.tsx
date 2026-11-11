import { createFileRoute } from '@tanstack/react-router';
import { FolderView } from '~/components/files/folder-view';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/')({
  head: () => seo({ title: 'All files · Stashbox', noindex: true }),
  component: () => <FolderView folderId={null} />
});
