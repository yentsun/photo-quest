import { useEffect, useState } from 'react';
import Nav from './components/Nav.jsx';
import ServerFinder from './components/ServerFinder.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import MarketPage from './pages/MarketPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import DeckPage from './pages/DeckPage.jsx';
import { useSync } from './hooks/useSync.js';
import './App.css';

/* LAW 4.7: player starting balance. */
const STARTING_DUST = 50;

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
  const [deckId, setDeckId] = useState(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [server, setServer] = useState(loadServer);

  const navigate = (p) => { setDeckId(null); setPage(p); };

  /* Push a history entry when a deck opens so browser back (mouse X1,
   * keyboard, gesture) closes the deck instead of leaving the PWA. */
  const openDeck = (id) => {
    history.pushState({ deckOpen: true }, '');
    setDeckId(id);
  };
  const closeDeck = () => {
    if (history.state?.deckOpen) history.back();
    else                          setDeckId(null);
  };

  useEffect(() => {
    const onPop = () => setDeckId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (server) localStorage.setItem(SERVER_KEY, JSON.stringify(server));
    else        localStorage.removeItem(SERVER_KEY);
  }, [server]);

  const sync = useSync(server?.url);

  const PageComponent = PAGES[page];

  return (
    <div className="app">
      <Nav
        page={page}
        onNavigate={navigate}
        dust={STARTING_DUST}
        server={server}
        sync={sync}
      />

      <main className="app__main">
        {deckId != null ? (
          <DeckPage
            deckId={deckId}
            server={server}
            sync={sync}
            onBack={closeDeck}
          />
        ) : (
          <PageComponent
            onLookForServer={() => setFinderOpen(true)}
            server={server}
            sync={sync}
            onOpenDeck={openDeck}
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
