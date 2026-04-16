import { words } from '@photo-quest/shared';

export default function InfusionBadge({ amount = 0 }) {
  return (
    <span style={{ color: '#d8b4fe' }}>
      {words?.dustSymbol || 'Đ'} {amount}
    </span>
  );
}
