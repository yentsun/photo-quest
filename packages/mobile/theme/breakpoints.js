/**
 * @file Breakpoint constants — every @media breakpoint from index.css.
 *
 * Sources:
 *   640px  → index.css:476,804,933   (item-grid 3-col, hide mobile-nav, sm-show)
 *   768px  → index.css:477           (item-grid 4-col)
 *   1024px → index.css:478           (item-grid 5-col, page padding 32px)
 *   1280px → index.css:479           (item-grid 6-col)
 *
 * Special (max-width):
 *   639px  → index.css:774,777       (hide viewer-nav on mobile, sidebar collapse)
 */

export const BP = {
  SM:   640,
  MD:   768,
  LG:   1024,
  XL:   1280,
  MOBILE_MAX: 639,     // max-width break for mobile-specific styles
};

/** Number of grid columns at each breakpoint (index.css:476-479) */
export const GRID_COLS = {
  [BP.MOBILE_MAX + 1]: 2,  // default (<640)
  [BP.SM]:   3,
  [BP.MD]:   4,
  [BP.LG]:   5,
  [BP.XL]:   6,
};

/**
 * Returns the number of grid columns for the current window width.
 * Pass width directly (from useWindowDimensions) so the hook is pure.
 */
export function gridColumns(width) {
  if (width >= BP.XL) return 6;
  if (width >= BP.LG) return 5;
  if (width >= BP.MD) return 4;
  if (width >= BP.SM) return 3;
  return 2;
}

import { useWindowDimensions } from 'react-native';

/**
 * Hook that returns the active breakpoint name and a boolean check helper.
 * Replaces all @media queries in the CSS.
 *
 * Usage:
 *   const { isAtLeast, isMobile } = useBreakpoint();
 *   const cols = isAtLeast('MD') ? 4 : 3;
 */
export function useBreakpoint() {
  const { width } = useWindowDimensions();

  const bp = width >= BP.XL ? 'XL'
    : width >= BP.LG ? 'LG'
    : width >= BP.MD ? 'MD'
    : width >= BP.SM ? 'SM'
    : 'XS';

  const isAtLeast = (name) => width >= BP[name];
  const isMobile = width <= BP.MOBILE_MAX;   // index.css:639px threshold

  return { width, bp, isAtLeast, isMobile };
}
