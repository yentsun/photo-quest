import EmptyState from '../components/EmptyState.jsx';

export default function LibraryPage() {
  return (
    <EmptyState
      icon="📚"
      title="Library"
      text="No media yet. Connect to your server to import files."
    />
  );
}
