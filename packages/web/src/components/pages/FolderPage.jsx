/**
 * @file Folder view page - shows subfolders and media for a folder ID.
 * LAW 2.7: maintains folder hierarchy with breadcrumb navigation.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useRefresh } from '../../contexts/RefreshContext.jsx';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchFolders, fetchMedia } from '../../utils/api.js';
import { FolderCard } from '../media/index.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, Spinner } from '../ui/index.js';

export default function FolderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const { signal } = useRefresh();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  const [folders, setFolders] = useState([]);
  const [directMedia, setDirectMedia] = useState([]);
  const [loading, setLoading] = useState(true);

  const folderId = Number(id);

  /* Fetch folders + direct media for this folder on mount / signal change. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const allFolders = await fetchFolders();
        if (cancelled) return;
        setFolders(allFolders);

        const folder = allFolders.find(f => f.id === folderId);
        if (folder) {
          const { items } = await fetchMedia({ folder: folder.path });
          if (!cancelled) setDirectMedia(items);
        }
      } catch (err) {
        console.error('Failed to load folder data:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [folderId, signal]);

  const folder = useMemo(() => folders.find(f => f.id === folderId), [folders, folderId]);
  const subfolders = useMemo(() => folders.filter(f => f.parentId === folderId), [folders, folderId]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [];
    let current = folders.find(f => f.id === folderId);
    while (current) {
      crumbs.unshift(current);
      current = current.parentId ? folders.find(f => f.id === current.parentId) : null;
    }
    return crumbs;
  }, [folders, folderId]);

  const handleMediaClick = (clickedMedia) => {
    navigate(`/media/${clickedMedia.id}`);
  };

  const handleShuffle = async () => {
    if (!folder) return;
    try {
      const { items } = await fetchMedia({ folder: folder.path, subtree: true });
      if (items.length === 0) return;
      pendingShuffle.current = true;
      slideshow.start(items, { order: 'random' });
    } catch (err) {
      console.error('Failed to fetch subtree media for shuffle:', err);
    }
  };

  /* Navigate to first shuffled item after slideshow starts. */
  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Spinner size="lg" />
        <p className="text-gray-400 text-sm">Loading folder...</p>
      </div>
    );
  }

  const folderIcon = <Icon name="folder" className="w-16 h-16" />;

  const folderName = folder
    ? folder.path.split(/[/\\]/).filter(Boolean).pop() || 'Folder'
    : 'Folder';

  const subtreeTotal = folder?.subtreeMediaCount || 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-gray-400 mb-4 overflow-x-auto">
          <button
            onClick={() => navigate('/dashboard')}
            className="hover:text-white transition-colors shrink-0"
          >
            Library
          </button>
          {breadcrumbs.map((crumb, i) => {
            const name = crumb.path.split(/[/\\]/).filter(Boolean).pop();
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={crumb.id} className="flex items-center gap-1 shrink-0">
                <span className="text-gray-600">/</span>
                {isLast ? (
                  <span className="text-white">{name}</span>
                ) : (
                  <button
                    onClick={() => navigate(`/folder/${crumb.id}`)}
                    className="hover:text-white transition-colors"
                  >
                    {name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{folderName}</h1>
          <p className="text-gray-400 text-sm">
            {subfolders.length > 0 && `${subfolders.length} folder${subfolders.length !== 1 ? 's' : ''}`}
            {subfolders.length > 0 && directMedia.length > 0 && ', '}
            {directMedia.length > 0 && `${directMedia.length} item${directMedia.length !== 1 ? 's' : ''}`}
            {subfolders.length === 0 && directMedia.length === 0 && '0 items'}
          </p>
        </div>
        {subtreeTotal > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      {/* Subfolders */}
      {subfolders.length > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {subfolders.map(sub => (
              <FolderCard
                key={sub.id}
                folder={sub}
              />
            ))}
          </div>
        </div>
      )}

      {/* Media Grid or Empty State */}
      {directMedia.length > 0 ? (
        <MediaGrid
          items={directMedia}
          onItemClick={handleMediaClick}
          onItemLike={likeMedia}
        />
      ) : subfolders.length === 0 ? (
        <EmptyState
          icon={folderIcon}
          title="Folder not found"
          description="This folder doesn't exist or contains no media."
        />
      ) : null}
    </div>
  );
}
