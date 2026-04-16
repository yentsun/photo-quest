import { MEDIA_TYPE } from '@photo-quest/shared';
import Card from './Card.jsx';
import InfusionBadge from './InfusionBadge.jsx';
import { mediaUrl } from '../../utils/mediaUrl.js';

export default function MediaCard({ item, serverUrl, onClick }) {
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const thumbUrl = mediaUrl(serverUrl, item);

  return (
    <Card
      header={item.title || item.filename || 'Untitled'}
      headerRight={<InfusionBadge amount={item.infusion || 0} />}
      art={
        isImage
          ? <img src={thumbUrl} alt={item.title} loading="lazy" draggable={false} />
          : <video src={thumbUrl} preload="metadata" muted draggable={false} />
      }
      onClick={onClick}
    />
  );
}
