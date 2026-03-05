/**
 * @file Slideshow playback controls component.
 */

import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { IconButton } from '../ui/index.js';

/**
 * Slideshow control bar with play/pause, next/prev, order toggle, and close.
 */
export default function SlideshowControls() {
  const {
    playing,
    order,
    currentIndex,
    items,
    prev,
    next,
    togglePlay,
    setOrder,
    stop,
  } = useSlideshow();

  const PlayIcon = (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const PauseIcon = (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );

  const PrevIcon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );

  const NextIcon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );

  const ShuffleIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h2.5l4 9m0 0l4-9H19m-7.5 9l2.5 5m-2.5-5h-5m5 0l-2.5 5m0 0H4m7 0h6" />
    </svg>
  );

  const ListIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );

  const CloseIcon = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
      <div className="flex items-center justify-center gap-4">
        {/* Order toggle */}
        <IconButton
          icon={order === 'random' ? ShuffleIcon : ListIcon}
          label={order === 'random' ? 'Random order' : 'Sequential order'}
          onClick={() => setOrder(order === 'random' ? 'sequential' : 'random')}
          size="md"
        />

        {/* Previous */}
        <IconButton
          icon={PrevIcon}
          label="Previous"
          onClick={prev}
          size="md"
        />

        {/* Play/Pause */}
        <IconButton
          icon={playing ? PauseIcon : PlayIcon}
          label={playing ? 'Pause' : 'Play'}
          onClick={togglePlay}
          size="lg"
        />

        {/* Next */}
        <IconButton
          icon={NextIcon}
          label="Next"
          onClick={next}
          size="md"
        />

        {/* Close */}
        <IconButton
          icon={CloseIcon}
          label="Close slideshow"
          onClick={stop}
          size="md"
        />
      </div>

      {/* Progress indicator */}
      <div className="text-center text-gray-400 text-sm mt-2">
        {currentIndex + 1} / {items.length}
      </div>
    </div>
  );
}
