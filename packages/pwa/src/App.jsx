import { useEffect, useState } from 'react';
import Nav from './components/Nav.jsx';
import ServerFinder from './components/ServerFinder.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import MarketPage from './pages/MarketPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import DeckPage from './pages/DeckPage.jsx';
import QuestPage from './pages/QuestPage.jsx';
import { useSync } from './hooks/useSync.js';
import { useLocalStore } from './hooks/useLocalStore.js';
import { STORES } from './db/localDb.js';
import './App.css';

const SERVER_KEY = 'photo-quest:server';

function loadServer() {
  try { return JSON.parse(localStorage.getItem(SERVER_KEY)) || null; }
  catch { return null; }
}

const PAGES = {
  inventory: InventoryPage,
  market:    MarketPage,
  library:   LibraryPage,
};

export default function App() {
  const [page, setPage] = useState('inventory');
  const [view, setView] = useState(null); /* { kind: 'deck'|'quest', id } */
  const [finderOpen, setFinderOpen] = useState(false);
  const [server, setServer] = useState(loadServer);

  const navigate = (p) => { setView(null); setPage(p); };

  /* Push a history entry when a sub-view opens so browser back (mouse X1,
   * keyboard, gesture) closes it instead of leaving the PWA. */
  const openView = (v) => {
    history.pushState({ viewOpen: true }, '');
    setView(v);
  };
  const closeView = () => {
    if (history.state?.viewOpen) history.back();
    else                         setView(null);
  };

  useEffect(() => {
    const onPop = () => setView(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (server) localStorage.setItem(SERVER_KEY, JSON.stringify(server));
    else        localStorage.removeItem(SERVER_KEY);
  }, [server]);

  const sync = useSync(server?.url);
  const playerRows = useLocalStore(STORES.PLAYER_STATS, sync?.phase);
  const dust = playerRows?.[0]?.dust ?? 0;

  const PageComponent = PAGES[page];

  return (
    <div className="app">
      <Nav
        page={page}
        onNavigate={navigate}
        dust={dust}
        server={server}
        sync={sync}
      />

      <main className="app__main">
        {view?.kind === 'deck' ? (
          <DeckPage
            deckId={view.id}
            server={server}
            onBack={closeView}
          />
        ) : view?.kind === 'quest' ? (
          <QuestPage
            questDeckId={view.id}
            server={server}
            onBack={closeView}
          />
        ) : (
          <PageComponent
            onLookForServer={() => setFinderOpen(true)}
            server={server}
            sync={sync}
            onOpenDeck={(id) => openView({ kind: 'deck', id })}
            onStartQuest={(id) => openView({ kind: 'quest', id })}
          />
        )}
      </main>

      <ServerFinder
        open={finderOpen}
        onClose={() => setFinderOpen(false)}
        onSelect={(s) => { setServer(s); setFinderOpen(false); }}
      />
    </div>
  );
}
