import Button from '../components/ui/Button.jsx';
import './QuestPage.css';

export default function QuestPage({ questDeckId, onBack }) {
  return (
    <div className="quest-page">
      <header className="quest-page__header">
        <h1 className="quest-page__title">🃏 Quest #{questDeckId ?? '?'}</h1>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </header>
      <p className="quest-page__placeholder">
        Quest started. The quest UI isn't built yet.
      </p>
    </div>
  );
}
