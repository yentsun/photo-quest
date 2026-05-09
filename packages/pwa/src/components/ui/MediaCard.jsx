import Card from './Card.jsx';
import InfusionBadge from './InfusionBadge.jsx';
import { useMediaSrc } from '../../hooks/useMediaSrc.js';

export default function MediaCard({ item, serverUrl, size = 'normal', onClick }) {
  /* Thumbnail mode — for video items the server returns the extracted
   * first frame as JPEG, so a single <img> renders both image and video
   * cards (and works offline once the blob is cached). */
  const thumbUrl = useMediaSrc(serverUrl, item, { thumbnail: true });

  return (
    <Card
      size={size}
      header={item.title || item.filename || 'Untitled'}
      headerRight={<InfusionBadge amount={item.infusion || 0} />}
      art={<img src={thumbUrl} alt={item.title} loading="lazy" draggable={false} crossOrigin="anonymous" />}
      onClick={onClick}
    />
  );
}
