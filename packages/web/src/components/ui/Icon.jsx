/**
 * @file Centralized SVG icon component.
 */

const paths = {
  close: { d: 'M6 18L18 6M6 6l12 12', stroke: true },
  folder: { d: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', stroke: true },
  heart: { d: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', stroke: true },
  image: { d: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', stroke: true },
  video: { d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', stroke: true },
  download: { d: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4', stroke: true },
  network: { d: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0', stroke: true },
  play: { d: 'M8 5v14l11-7z', fill: true },
  pause: { d: 'M6 4h4v16H6V4zm8 0h4v16h-4V4z', fill: true },
  prev: { d: 'M15 19l-7-7 7-7', stroke: true },
  next: { d: 'M9 5l7 7-7 7', stroke: true },
  up: { d: 'M5 15l7-7 7 7', stroke: true },
  down: { d: 'M19 9l-7 7-7-7', stroke: true },
  trash: { d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', stroke: true },
  info: { d: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', stroke: true },
  shuffle: { d: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5', stroke: true },
  list: { d: 'M4 6h16M4 12h16M4 18h16', stroke: true },
  maximize: { d: 'M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4', stroke: true },
  minimize: { d: 'M8 4v4H4M16 4v4h4M8 20v-4H4M16 20v-4h4', stroke: true },
  copy: { d: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z', stroke: true },
  refresh: { d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', stroke: true },
  search: { d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', stroke: true },
  warning: { d: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', stroke: true },
  edit: { d: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z', stroke: true },
};

/**
 * @param {Object} props
 * @param {keyof paths} props.name - Icon name
 * @param {string} [props.className] - CSS classes (should include size like w-5 h-5)
 */
export default function Icon({ name, className = 'w-5 h-5', ...rest }) {
  const icon = paths[name];
  if (!icon) return null;

  return (
    <svg
      className={className}
      fill={icon.fill ? 'currentColor' : 'none'}
      stroke={icon.stroke ? 'currentColor' : undefined}
      viewBox="0 0 24 24"
      {...rest}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={icon.stroke ? 2 : undefined}
        d={icon.d}
      />
    </svg>
  );
}
