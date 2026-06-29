import { useState, useEffect } from 'react';

const SCAN_WIDTH = 3;

export default function ProgressBar({
  value = 0,
  max = 100,
  width = 16,
  brackets = true,
  showPct = true,
  indeterminate = false,
  variant,
}) {
  const [scanPos, setScanPos] = useState(0);

  useEffect(() => {
    if (!indeterminate) return;
    const id = setInterval(() => setScanPos(p => (p + 1) % width), 80);
    return () => clearInterval(id);
  }, [indeterminate, width]);

  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const onCount = indeterminate ? null : Math.round((pct / 100) * width);

  const cells = Array.from({ length: width }, (_, i) => {
    const lit = indeterminate
      ? (i >= scanPos && i < scanPos + SCAN_WIDTH) ||
        (scanPos + SCAN_WIDTH > width && i < (scanPos + SCAN_WIDTH) % width)
      : i < onCount;
    return <i key={i} className={`ascii-meter-cell${lit ? ' on' : ''}`} />;
  });

  return (
    <span className={`ascii-meter${variant ? ` ${variant}` : ''}`}>
      {brackets && <span className="ascii-meter-brk">[</span>}
      <span className="ascii-meter-cells">{cells}</span>
      {brackets && <span className="ascii-meter-brk">]</span>}
      {showPct && !indeterminate && <span className="ascii-meter-pct">{Math.round(pct)}%</span>}
    </span>
  );
}
