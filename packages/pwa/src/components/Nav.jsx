import DustBadge from './ui/DustBadge.jsx';
import './Nav.css';

const TABS = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'market',    label: 'Market' },
  { id: 'library',   label: 'Library' },
];

export default function Nav({ page, onNavigate, dust }) {
  return (
    <header className="nav">
      <button className="nav__brand" onClick={() => onNavigate('inventory')}>
        Photo Quest
      </button>

      <div className="nav__links">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav__link ${page === t.id ? 'active' : ''}`}
            onClick={() => onNavigate(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DustBadge dust={dust} />
    </header>
  );
}
