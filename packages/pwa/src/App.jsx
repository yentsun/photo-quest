import { useState } from 'react';
import Nav from './components/Nav.jsx';
import ServerFinder from './components/ServerFinder.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import MarketPage from './pages/MarketPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import './App.css';

/* LAW 4.7: player starting balance. */
const STARTING_DUST = 50;

const PAGES = {
  inventory: InventoryPage,
  market:    MarketPage,
  library:   LibraryPage,
};

export default function App() {
  const [page, setPage] = useState('inventory');
  const [finderOpen, setFinderOpen] = useState(false);
  const [server, setServer] = useState(null);

  const PageComponent = PAGES[page];

  const handleSelectServer = (s) => {
    setServer(s);
    setFinderOpen(false);
  };

  return (
    <div className="app">
      <Nav page={page} onNavigate={setPage} dust={STARTING_DUST} />

      <main className="app__main">
        <PageComponent onLookForServer={() => setFinderOpen(true)} server={server} />
      </main>

      <footer className="app__footer">
        {server ? `Connected: ${server.host}` : 'Offline-ready PWA'}
      </footer>

      <ServerFinder
        open={finderOpen}
        onClose={() => setFinderOpen(false)}
        onSelect={handleSelectServer}
      />
    </div>
  );
}
