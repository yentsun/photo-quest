import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function InventoryPage({ onLookForServer }) {
  return (
    <EmptyState
      icon="📷"
      title="Your inventory is empty"
      text="Connect to your server to import media and start collecting cards."
      action={
        <Button variant="primary" size="lg" onClick={onLookForServer}>
          Look for server
        </Button>
      }
    />
  );
}
