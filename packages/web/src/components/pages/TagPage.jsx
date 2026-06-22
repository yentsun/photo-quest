/**
 * @file Media filtered by a single tag.
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMediaActions } from '../../hooks/useMedia.js';
import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { fetchMedia } from '../../utils/api.js';
import { MediaGrid } from '../media/index.js';
import { EmptyState } from '../layout/index.js';
import { Button, Icon, PageLoader } from '../ui/index.js';

export default function TagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const { likeMedia } = useMediaActions();
  const slideshow = useSlideshow();
  const pendingShuffle = useRef(false);

  useEffect(() => { slideshow.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [media, setMedia] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const decodedTag = decodeURIComponent(tag);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMedia({ tag: decodedTag })
      .then(({ items, total: t }) => {
        if (cancelled) return;
        setMedia(items);
        setTotal(t);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch tagged media:', err);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [decodedTag]);

  const handleShuffle = () => {
    if (media.length === 0) return;
    pendingShuffle.current = true;
    slideshow.start(media, { order: 'random', total });
  };

  useEffect(() => {
    if (pendingShuffle.current && slideshow.active && slideshow.current) {
      pendingShuffle.current = false;
      navigate(`/media/${slideshow.current.id}`);
    }
  }, [slideshow.active, slideshow.current, navigate]);

  if (loading) {
    return <PageLoader message={`Loading "${decodedTag}"…`} />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="text" onClick={() => navigate('/tags')}>
              Tags
            </Button>
            <span className="text-gray-600">/</span>
            <h1 className="text-2xl font-bold text-white">{decodedTag}</h1>
          </div>
          <p className="text-gray-400 text-sm">{total} item{total !== 1 ? 's' : ''}</p>
        </div>
        {media.length > 0 && (
          <Button variant="secondary" onClick={handleShuffle}>
            Shuffle
          </Button>
        )}
      </div>

      <MediaGrid
        items={media}
        onItemClick={m => navigate(`/media/${m.id}`)}
        onItemLike={likeMedia}
        emptyState={
          <EmptyState
            icon={<Icon name="list" className="w-16 h-16" />}
            title={`No media tagged "${decodedTag}"`}
            description="Tag items from the media viewer."
          />
        }
      />
    </div>
  );
}
