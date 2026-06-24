import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMediaActions } from '../hooks/useMedia.js';
import { useRefresh } from '../contexts/RefreshContext.jsx';
import { useSlideshow } from '../contexts/SlideshowContext.jsx';
import { useScan } from '../contexts/ScanContext.jsx';
import { fetchFolders, fetchMedia, getLastFolders } from '../utils/api.js';
import { getPageCache, setPageCache, isPageCacheValid } from '../utils/pageCache.js';
import { idbGetFolders } from '../services/idb.js';
import { FolderCard, MediaGrid } from './media/index.js';
import { EmptyState } from './layout/index.js';
import { Button, Icon, Input, Loader, Modal } from './ui/index.js';

function byFolderName(a, b) {
  const nameA = a.path.split(/[/\\]/).pop() || '';
  const nameB = b.path.split(/[/\\]/).pop() || '';
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
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
  const { addFolderWithPath, removeFolder, refreshLibrary, likeMedia } = useMediaActions();
  const { signal, bump } = useRefresh();
  const slideshow = useSlideshow();
  const { isScanning } = useScan();
  const pendingShuffle = useRef(false);

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
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const searchRef = useRef('');
  const searchOffsetRef = useRef(0);
  const searchTotalRef = useRef(0);
  const searchLoadingMoreRef = useRef(false);

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
      searchOffsetRef.current = 0;
      searchTotalRef.current = 0;
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    setSearchResults([]);
    searchOffsetRef.current = 0;
    fetchMedia({ search: debouncedSearch, limit: 200 })
      .then(({ items, total }) => {
        if (cancelled) return;
        setSearchResults(items);
        setSearchTotal(total);
        searchOffsetRef.current = items.length;
        searchTotalRef.current = total;
      })
      .catch(err => console.error('Search failed:', err))
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const handleSearchLoadMore = useCallback(async () => {
    if (searchLoadingMoreRef.current) return;
    if (searchOffsetRef.current >= searchTotalRef.current) return;
    if (!searchRef.current) return;
    searchLoadingMoreRef.current = true;
    setSearchLoadingMore(true);
    try {
      const { items: more } = await fetchMedia({ search: searchRef.current, limit: 200, offset: searchOffsetRef.current });
      if (more.length > 0) {
        searchOffsetRef.current += more.length;
        setSearchResults(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...more.filter(m => !existingIds.has(m.id))];
        });
      }
    } catch (err) {
      console.error('Failed to load more search results:', err);
    } finally {
      searchLoadingMoreRef.current = false;
      setSearchLoadingMore(false);
    }
  }, []);

  const rootFolders = useMemo(() => folders.filter(f => f.parentId === null).sort(byFolderName), [folders]);
  const totalMedia = useMemo(
    () => rootFolders.reduce((sum, f) => sum + (f.subtreeMediaCount || 0), 0),
    [rootFolders],
  );

  useEffect(() => {
    if (!showAddFolder) { setSelectedPath(null); setBrowsing(false); reset(); }
  }, [showAddFolder, reset]);

  const handleShuffle = async () => {
    if (totalMedia === 0) return;
    try {
      const { items, total } = await fetchMedia({ random: true });
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, { order: 'sequential', total });
    } catch (err) { console.error('Failed to fetch media for shuffle:', err); }
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
    const folderName = folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder';
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

  if (loading) return <div className="page-loader"><Loader message="Fetching your media folders…" /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="page-subtitle">{totalMedia} items</p>
        </div>
        <div className="page-actions">
          {totalMedia > 0 && (
            <Button variant="ghost" size="sm" onClick={handleShuffle} disabled={isScanning} icon={<Icon name="shuffle" className="icon-sm" />}>
              <span className="sm-show">Shuffle</span>
            </Button>
          )}
          {rootFolders.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isScanning} title="Rescan folders for new files" icon={<Icon name="refresh" className="icon-sm" />}>
              <span className="sm-show">Refresh</span>
            </Button>
          )}
          <Button size="sm" onClick={() => setShowAddFolder(true)} disabled={isScanning} icon={<Icon name="folder" className="icon-sm" />}>
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
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${importProgress.total ? (importProgress.processed / importProgress.total) * 100 : 0}%` }} />
            </div>
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
            <span className="spinner spinner-lg" />
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <MediaGrid
              items={searchResults}
              onItemClick={item => navigate(`/media/${item.id}`)}
              onItemLike={likeMedia}
              onNearEnd={searchResults.length < searchTotal ? handleSearchLoadMore : undefined}
            />
            {searchLoadingMore && (
              <div className="loading-row">
                <span className="spinner spinner-sm" />
                <span>Loading more items…</span>
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
            autoFocus
          />
        </div>
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
