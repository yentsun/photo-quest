/**
 * @file Animation presets — every transition and @keyframes value from index.css.
 *
 * Components must use these durations/easings, never invent new values, to
 * guarantee animation parity between web and mobile.
 *
 * Transition sources:
 *   0.08s  → index.css:183,242,285,885  (nav-item, btn, icon-btn, tag-list-item)
 *   0.10s  → index.css:144,313,445,821  (sidebar-logo a, input/placeholder, rename-btn, tag-add)
 *   0.15s  → index.css:596,598,619,766–770 (folder-card remove/rename, like-btn hover, viewer nav fade)
 *   0.20s  → index.css:98,120            (app-body padding-left, sidebar width)
 *
 * Keyframe sources:
 *   sol-blink  → index.css:359  spinner blinking cursor (1.05s, steps(2,end))
 *   scrim-in   → index.css:383  modal backdrop fade-in (0.12s ease)
 *   modal-in   → index.css:384  modal panel slide-up (0.16s ease, translateY 8px)
 *   like-pop   → index.css:627  like button pop (0.3s ease-out, scale 1→1.5→1)
 */

/* ==================================================================
   Transition timings (duration, easing)
   ================================================================== */

/** 80ms — hover/active state transitions on interactive elements */
export const TRANSITION_FAST = { duration: 80, easing: 'ease' };

/** 100ms — input focus, logo hover, select, folder rename fade */
export const TRANSITION_NORMAL = { duration: 100, easing: 'ease' };

/** 150ms — like-hover bg, opacity fades (viewer nav, folder overlay buttons) */
export const TRANSITION_MEDIUM = { duration: 150, easing: 'ease' };

/** 200ms — layout shifts (sidebar expand/collapse, app-body padding) */
export const TRANSITION_LAYOUT = { duration: 200, easing: 'ease' };

/* ==================================================================
   Keyframe presets (for Animated.timing / Animated.sequence)
   ================================================================== */

/**
 * sol-blink (spinner)
 *   1.05s cycle, steps(2,end), toggles background transparent at 50%
 *   Equivalent: Animated.loop with 0 → 1 timing 1.05s, opacity-based flash
 */
export const SPINNER_BLINK = {
  duration: 1050,
  steps: [0, 0.5, 1],          // 0–50 % solid, 50–100% transparent
  stepPositions: [0, 0.5, 1],
};

/**
 * scrim-in (modal backdrop)
 *   0.12s ease, opacity 0→1
 */
export const SCRIM_IN = {
  from: { opacity: 0 },
  to:   { opacity: 1 },
  duration: 120,
  easing: 'ease',
};

/**
 * modal-in (modal panel entrance)
 *   0.16s ease, translateY(8px)+opacity 0 → none+opacity 1
 */
export const MODAL_IN = {
  from: { opacity: 0, translateY: 8 },
  to:   { opacity: 1, translateY: 0 },
  duration: 160,
  easing: 'ease',
};

/**
 * like-pop (like button scale pop)
 *   0.3s ease-out, scale 1 → 1.5(40%) → 1
 */
export const LIKE_POP = {
  keyframes: [
    { scale: 1,   at: 0 },
    { scale: 1.5, at: 0.4 },
    { scale: 1,   at: 1 },
  ],
  duration: 300,
  easing: 'ease-out',
};

/* ==================================================================
   Composite map — keyed by CSS source class for traceability
   ================================================================== */

export const cssToPreset = {
  '.nav-item, .btn, .icon-btn, .tag-list-item':    TRANSITION_FAST,
  '.sidebar-logo a, .input, .select, .rename-btn': TRANSITION_NORMAL,
  '.folder-card:hover buttons, .like-btn, .viewer-fullscreen nav': TRANSITION_MEDIUM,
  '.sidebar, .app-body padding-left':               TRANSITION_LAYOUT,
};

export const cssToKeyframe = {
  'sol-blink': SPINNER_BLINK,
  'scrim-in':  SCRIM_IN,
  'modal-in':  MODAL_IN,
  'like-pop':  LIKE_POP,
};

export default {
  TRANSITION_FAST,
  TRANSITION_NORMAL,
  TRANSITION_MEDIUM,
  TRANSITION_LAYOUT,
  SPINNER_BLINK,
  SCRIM_IN,
  MODAL_IN,
  LIKE_POP,
  cssToPreset,
  cssToKeyframe,
};
