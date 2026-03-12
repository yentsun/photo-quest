/**
 * @file Slideshow playback controls component.
 */

import { useSlideshow } from '../../contexts/SlideshowContext.jsx';
import { Icon, IconButton } from '../ui/index.js';

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

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
      <div className="flex items-center justify-center gap-4">
        <IconButton
          icon={<Icon name={order === 'random' ? 'shuffle' : 'list'} />}
          label={order === 'random' ? 'Random order' : 'Sequential order'}
          onClick={() => setOrder(order === 'random' ? 'sequential' : 'random')}
          size="md"
        />

        <IconButton
          icon={<Icon name="prev" className="w-6 h-6" />}
          label="Previous"
          onClick={prev}
          size="md"
        />

        <IconButton
          icon={<Icon name={playing ? 'pause' : 'play'} className="w-6 h-6" />}
          label={playing ? 'Pause' : 'Play'}
          onClick={togglePlay}
          size="lg"
        />

        <IconButton
          icon={<Icon name="next" className="w-6 h-6" />}
          label="Next"
          onClick={next}
          size="md"
        />

        <IconButton
          icon={<Icon name="close" className="w-6 h-6" />}
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
