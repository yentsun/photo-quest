import { MEDIA_TYPE, words } from '@photo-quest/shared';
import Card from './Card.jsx';

export default function MediaCard({ item, serverUrl, size = 'normal', onClick }) {
  const isImage = item.type === MEDIA_TYPE.IMAGE;
  const thumbUrl = isImage
    ? `${serverUrl}/image/${item.id}`
    : `${serverUrl}/stream/${item.id}`;
  const infusion = item.infusion || 0;

  return (
    <Card
      size={size}
      header={item.title || item.filename || 'Untitled'}
      headerRight={<span style={{ color: '#d8b4fe' }}>{words?.dustSymbol || 'Đ'} {infusion}</span>}
      art={
        isImage
          ? <img src={thumbUrl} alt={item.title} loading="lazy" draggable={false} />
          : <video src={thumbUrl} preload="metadata" muted draggable={false} />
      }
      onClick={onClick}
    />
  );
}
