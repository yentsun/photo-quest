import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMediaActions } from '../hooks/useMedia.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useSlideshow } from '../contexts/SlideshowContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { fetchFolders, fetchMedia, getLastFolders } from '../utils/api.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../utils/pageCache.js';
import usePersistedState from '../hooks/usePersistedState.js';
import { idbGetFolders } from '../services/idb.js';
import { FolderCard, MediaGrid } from './media/index.js';
import { EmptyState } from './layout/index.js';
import { Button, Icon, Input, Loader, Modal, ProgressBar, Select } from './ui/index.js';

function byFolderName(a, b) {
  const nameA = a.path.split(/[/\\]/).pop() || '';
  const nameB = b.path.split(/[/\\]/).pop() || '';
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

function byFolderDate(a, b) {
  return b.id - a.id;
}

const SEARCH_PAGE_SIZE = 30;

function getSearchPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, current]);
  for (let i = Math.max(0, current - 2); i <= Math.min(total - 1, current + 2); i++) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
    result.push(sorted[i]);
  }
  return result;
}

function usePathValidation() {
  const [pathValid, setPathValid] = useState(null);
  const [pathError, setPathError] = useState(null);
  const [pathInfo, setPathInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  const validate = useCallback(async (path) => {
    if (!path) return;
    setChecking(true);
    setPathValid(null);
    setPathError(null);
    setPathInfo(null);
    try {
      const res = await fetch('/media/check-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      setPathValid(data.valid);
      setPathError(data.valid ? null : data.error);
      setPathInfo(data.valid ? { files: data.files, newEstimate: data.newEstimate } : null);
    } catch {
      setPathValid(null);
      setPathError('Could not reach server');
    } finally {
      setChecking(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPathValid(null);
    setPathError(null);
    setPathInfo(null);
    setChecking(false);
  }, []);

  return { pathValid, pathError, pathInfo, checking, validate, reset };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { addFolderWithPath, removeFolder, refreshLibrary } = useMediaActions();
  const { signal, bump } = useRefresh();
  const slideshow = useSlideshow();
  const { isScanning } = useScan();
  const pendingShuffle = useRef(false);
  const [shuffling, setShuffling] = useState(false);

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [scanProgress, setScanProgress] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [browsing, setBrowsing] = useState(false);
  const { pathValid, pathError, pathInfo, checking, validate, reset } = usePathValidation();

  const [folders, setFolders] = useState(() => {
    if (isPageCacheValid('dashboard', signal)) return getPageCache('dashboard').data.folders;
    return getLastFolders() || [];
  });
  const [loading, setLoading] = useState(() => {
    if (isPageCacheValid('dashboard', signal)) return false;
    return !getLastFolders();
  });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef('');

  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamPage = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const searchPage = searchParamPage - 1;
  const [folderSort, setFolderSort] = usePersistedState('dashboard:sort', 'name');

  const goSearchPage = useCallback((p) => {
    if (p === 0) { setSearchParams({}, { replace: true }); return; }
    setSearchParams({ page: String(p + 1) });
  }, [setSearchParams]);

  useEffect(() => {
    document.querySelector('.page')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [searchPage]);

  useEffect(() => {
    if (isPageCacheValid('dashboard', signal)) return;
    let cancelled = false;
    idbGetFolders()
      .then(cached => { if (!cancelled && cached.length > 0 && !getLastFolders()) { setFolders(cached); setLoading(false); } })
      .catch(() => {});
    fetchFolders()
      .then(data => {
        if (!cancelled) {
          setFolders(data);
          setLoading(false);
          setPageCache('dashboard', { folders: data }, signal);
        }
      })
      .catch(err => { console.error('Failed to fetch folders:', err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signal]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); searchRef.current = searchQuery; }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    setSearchResults([]);
    goSearchPage(0);
    fetchMedia({ search: debouncedSearch, limit: SEARCH_PAGE_SIZE })
      .then(({ items, total }) => {
        if (cancelled) return;
        setSearchResults(items);
        setSearchTotal(total);
      })
      .catch(err => console.error('Search failed:', err))
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Fetch page N of search results when searchPage changes. */
  useEffect(() => {
    if (!debouncedSearch || searchPage === 0) return;
    let cancelled = false;
    setSearchLoading(true);
    fetchMedia({ search: debouncedSearch, limit: SEARCH_PAGE_SIZE, offset: searchPage * SEARCH_PAGE_SIZE })
      .then(({ items }) => {
        if (cancelled) return;
        setSearchResults(items);
      })
      .catch(err => console.error('Search page fetch failed:', err))
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [searchPage, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const rootFolders = useMemo(() => folders.filter(f => f.parentId === null).sort(folderSort === 'date' ? byFolderDate : byFolderName), [folders, folderSort]);
  const totalMedia = useMemo(
    () => rootFolders.reduce((sum, f) => sum + (f.subtreeMediaCount || 0), 0),
    [rootFolders],
  );

  useEffect(() => {
    if (!showAddFolder) { setSelectedPath(null); setBrowsing(false); reset(); }
  }, [showAddFolder, reset]);

  const handleShuffle = async () => {
    if (totalMedia === 0) return;
    const BATCH = 500;
    setShuffling(true);
    try {
      const { items, total } = await fetchMedia({ random: true, limit: BATCH });
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, {
        order: 'sequential',
        total,
        loadMore: async () => {
          const res = await fetchMedia({ random: true, limit: BATCH });
          return res.items;
        },
      });
    } catch (err) { console.error('Failed to fetch media for shuffle:', err); }
    finally { setShuffling(false); }
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  const handleRefresh = async () => {
    if (rootFolders.length === 0) {
      setScanProgress('No folders to refresh. Add a folder first.');
      setTimeout(() => setScanProgress(null), 3000);
      return;
    }
    setScanProgress('Refreshing library...');
    try {
      const result = await refreshLibrary(folders, (progress) => setScanProgress(progress));
      const totalFolders = result.serverFolders + result.clientFolders;
      setScanProgress(`Refreshed ${totalFolders} folder${totalFolders !== 1 ? 's' : ''}. Found ${result.newFiles} file${result.newFiles !== 1 ? 's' : ''}.`);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to refresh library:', err);
      setScanProgress('Refresh failed: ' + err.message);
      setTimeout(() => setScanProgress(null), 5000);
    }
  };

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const res = await fetch('/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data.cancelled || !data.path) return;
      setSelectedPath(data.path);
      validate(data.path);
    } catch (err) { console.error('Failed to open folder dialog:', err); }
    finally { setBrowsing(false); }
  };

  const handleAddFolder = async () => {
    if (!selectedPath || !pathValid) return;
    setImportProgress(null);
    try {
      const { scanId, total } = await addFolderWithPath(selectedPath);
      setImportProgress({ total, processed: 0 });
      const { cancelled } = await new Promise((resolve, reject) => {
        const es = new EventSource('/jobs/events');
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.scanId !== scanId) return;
            if (data.type === 'import_progress') setImportProgress({ total: data.total, processed: data.processed });
            if (data.type === 'import_complete') { setImportProgress({ total: data.total, processed: data.processed }); es.close(); resolve({ cancelled: false }); }
            if (data.type === 'import_cancelled') { es.close(); resolve({ cancelled: true }); }
          } catch { /* ignore parse errors */ }
        };
        es.onerror = () => { es.close(); reject(new Error('Lost connection')); };
      });
      bump();
      setScanProgress(cancelled ? 'Scan stopped.' : `Imported ${total} files.`);
      setShowAddFolder(false);
      setImportProgress(null);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to scan folder:', err);
      setScanProgress('Failed: ' + err.message);
      setImportProgress(null);
      setTimeout(() => setScanProgress(null), 5000);
    }
  };

  const handleRemoveFolder = async (folder) => {
    const folderName = folder.name || folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
    if (!confirm(`Remove "${folderName}" from library?\n\nYour likes will be preserved if you re-add this folder later.`)) return;
    try {
      const result = await removeFolder(folder.id);
      setScanProgress(`Removed "${folderName}" (${result.hidden} items hidden)`);
      setTimeout(() => setScanProgress(null), 3000);
    } catch (err) {
      console.error('Failed to remove folder:', err);
      alert('Failed to remove folder: ' + err.message);
    }
  };

  if (loading && folders.length === 0) return <div className="page-loader"><Loader message="Fetching your media folders…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="page-subtitle">{totalMedia} items</p>
        </div>
        <div className="page-actions">
          {totalMedia > 0 && (
            <Button variant="ghost" size="sm" onClick={handleShuffle} disabled={isScanning || shuffling} icon={<Icon name="shuffle" className="icon-sm" />}>
              <span className="sm-show">{shuffling ? 'Starting…' : 'Shuffle'}</span>
            </Button>
          )}
          {rootFolders.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isScanning} title="Rescan folders for new files" icon={<Icon name="refresh" className="icon-sm" />}>
              <span className="sm-show">Refresh</span>
            </Button>
          )}
          {rootFolders.length > 0 && (
            <Select
              value={folderSort}
              onChange={e => setFolderSort(e.target.value)}
              options={[
                { value: 'name', label: 'Name' },
                { value: 'date', label: 'Date' },
              ]}
              title="Sort order"
            />
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowAddFolder(true)} disabled={isScanning} icon={<Icon name="folder" className="icon-sm" />}>
            <span className="sm-show">Add Folder</span>
          </Button>
          <Button
            variant={debouncedSearch ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSearchOpen(true)}
            title="Search by title"
            icon={<Icon name="search" className="icon-sm" />}
          >
            <span className="sm-show">Search</span>
          </Button>
        </div>
      </div>

      {scanProgress && (
        <div className="scan-notice">
          <p>{scanProgress}</p>
        </div>
      )}

      <Modal open={showAddFolder} onClose={() => setShowAddFolder(false)} title="Add Folder">
        <Button
          variant="ghost"
          onClick={handleBrowse}
          disabled={browsing || !!importProgress}
          className="btn-full"
        >
          {browsing ? 'Opening dialog…' : selectedPath ? 'Browse again…' : 'Browse for folder…'}
        </Button>

        {selectedPath && <div className="path-preview">{selectedPath}</div>}

        {checking && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--sol-text-mut)' }}>Checking path…</p>}
        {pathError && <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--sol-red)' }}>{pathError}</p>}
        {pathValid && pathInfo && (
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--sol-green)' }}>
            {pathInfo.files} media file{pathInfo.files !== 1 ? 's' : ''} found
            {pathInfo.newEstimate > 0 && ` (${pathInfo.newEstimate} new)`}
            {pathInfo.newEstimate === 0 && pathInfo.files > 0 && ' (all already in library)'}
          </p>
        )}

        {importProgress && (
          <div className="import-progress">
            <div className="import-progress-label">
              <span>Importing files…</span>
              <span>{importProgress.processed}/{importProgress.total}</span>
            </div>
            <ProgressBar value={importProgress.processed} max={importProgress.total || 1} width={20} showPct={false} />
          </div>
        )}

        {selectedPath && !isScanning && (
          <Button variant="primary" onClick={handleAddFolder} disabled={!pathValid || checking || browsing}>
            Add
          </Button>
        )}
      </Modal>

      {debouncedSearch ? (
        searchLoading ? (
          <div className="loading-row" style={{ paddingTop: 48, paddingBottom: 48 }}>
            <Loader />
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <MediaGrid
              items={searchResults}
              onItemClick={item => navigate(`/media/${item.id}`)}
            />
            {searchTotal > SEARCH_PAGE_SIZE && (
              <div className="pagination-row">
                <Button variant="ghost" size="sm" disabled={searchPage === 0} onClick={() => goSearchPage(searchPage - 1)} icon={<Icon name="prev" className="icon-sm" />} />
                {getSearchPageNumbers(searchPage, Math.ceil(searchTotal / SEARCH_PAGE_SIZE)).map((p, i) =>
                  p === '…'
                    ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
                    : <Button key={p} variant={p === searchPage ? 'primary' : 'ghost'} size="sm" onClick={() => goSearchPage(p)}>{p + 1}</Button>
                )}
                <Button variant="ghost" size="sm" disabled={searchPage >= Math.ceil(searchTotal / SEARCH_PAGE_SIZE) - 1} onClick={() => goSearchPage(searchPage + 1)} icon={<Icon name="next" className="icon-sm" />} />
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<Icon name="search" className="icon-2xl" />}
            title="No results"
            description={`No media matching "${debouncedSearch}".`}
          />
        )
      ) : rootFolders.length > 0 ? (
        <div className="item-grid">
          {rootFolders.map(folder => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onRemove={() => handleRemoveFolder(folder)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Icon name="folder" className="icon-2xl" />}
          title="No media yet"
          description="Add a folder from your device to start building your library."
          action={{ label: 'Add Folder', onClick: () => setShowAddFolder(true) }}
        />
      )}

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search">
        <div className="search-wrap">
          <Icon name="search" className="search-icon icon-sm" />
          <Input
            type="search"
            placeholder="Search by title…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setSearchOpen(false); }}
            autoFocus
          />
        </div>
        {debouncedSearch && !searchLoading && (
          <p className="search-hint">
            {searchTotal > 0
              ? `${searchTotal} result${searchTotal !== 1 ? 's' : ''} — press Enter or close to view`
              : `No results for "${debouncedSearch}"`}
          </p>
        )}
        {debouncedSearch && (
          <Button
            variant="text"
            onClick={() => { setSearchQuery(''); setDebouncedSearch(''); searchRef.current = ''; }}
          >
            Clear search
          </Button>
        )}
      </Modal>
    </div>
  );
}
