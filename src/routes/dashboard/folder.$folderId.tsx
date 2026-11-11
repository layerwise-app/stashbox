import { createFileRoute } from '@tanstack/react-router';
import { FolderView } from '~/components/files/folder-view';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/folder/$folderId')({
  head: () => seo({ title: 'Folder · Stashbox', noindex: true }),
  component: FolderPage
});

function FolderPage() {
  const { folderId } = Route.useParams();
  return <FolderView key={folderId} folderId={folderId} />;
}
