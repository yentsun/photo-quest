import DustBadge from './ui/DustBadge.jsx';
import './Nav.css';

const TABS = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'market',    label: 'Market' },
  { id: 'library',   label: 'Library' },
];

const SYNC_LABELS = {
  syncing: 'Syncing…',
  paused:  'Paused',
  error:   'Sync failed',
  done:    'Synced',
  idle:    '',
};

const PILL_TITLES = {
  syncing: 'Click to pause sync',
  paused:  'Click to resume sync',
  error:   'Click to retry sync',
  done:    'Click to resync',
  idle:    '',
};

function syncPercent(progress) {
  let count = 0, total = 0;
  for (const p of Object.values(progress)) { count += p.count; total += p.total; }
  if (!total) return 0;
  return Math.min(100, Math.round((count / total) * 100));
}

export default function Nav({ page, onNavigate, dust, server, sync }) {
  const pct = sync.phase === 'syncing' ? syncPercent(sync.progress) : 0;
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

      <div className="nav__right">
        {server && (
          <button
            className={`nav__server nav__server--${sync.phase}`}
            onClick={sync.toggle}
            title={sync.error || PILL_TITLES[sync.phase]}
          >
            {sync.phase === 'syncing' && (
              <span className="nav__server-fill" style={{ width: `${pct}%` }} />
            )}
            <span className="nav__server-dot" />
            <span className="nav__server-host">{server.host}</span>
            {SYNC_LABELS[sync.phase] && (
              <span className="nav__server-status">
                {sync.phase === 'syncing' ? `${pct}%` : SYNC_LABELS[sync.phase]}
              </span>
            )}
          </button>
        )}
        <DustBadge dust={dust} />
      </div>
    </header>
  );
}
