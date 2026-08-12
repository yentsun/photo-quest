/**
 * @file Design tokens — every value extracted 1:1 from packages/web/src/index.css.
 *
 * This is the parity backbone: no value here differs from the CSS source.
 * Phases 3+ will move the values themselves behind a client-safe shared entry,
 * but the set of tokens must remain identical.
 *
 * Sources per line:
 *   --base03 … --base1     → index.css:14-18
 *   --sol-yellow … --sol-green → index.css:20-27
 *   --sol-bg … --sol-accent-bg  → index.css:29-38
 *   --font-mono            → index.css:40
 *   --fs-xs … --fs-xl      → index.css:41-46
 *   --sidebar-w, --row-h   → index.css:48-49
 */

/* ==================================================================
   Palette — raw Solarized
   ================================================================== */

export const base = {
  base03: '#002b36',
  base02: '#073642',
  base01: '#586e75',
  base0:  '#839496',
  base1:  '#93a1a1',
};

export const accents = {
  yellow:  '#b58900',
  orange:  '#cb4b16',
  red:     '#dc322f',
  magenta: '#d33682',
  violet:  '#6c71c4',
  blue:    '#268bd2',
  cyan:    '#2aa198',
  green:   '#859900',
};

/* ==================================================================
   Semantic — theme roles (single dark theme)
   ================================================================== */

export const colors = {
  bg:        '#002b36',
  surface:   '#073642',
  dim:       '#00343f',
  border:    '#0c4753',
  borderSoft:'#093b46',
  text:      '#839496',
  textEm:    '#93a1a1',
  textMut:   '#586e75',
  accent:    '#268bd2',
  accentBg:  '#0a4250',
};

/* ==================================================================
   Typography
   ================================================================== */

export const fontFamily = {
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
};

export const fontSize = {
  xs:  11,
  sm:  12,
  base: 13,
  md:  14,
  lg:  16,
  xl:  20,
};

/* ==================================================================
   Layout
   ================================================================== */

export const layout = {
  sidebarWidth: 208,
  sidebarCollapsedWidth: 52,     // @media (max-width:639px) override
  rowHeight: 32,
  lineHeight: 1.45,
};

/* ==================================================================
   Spacing (from class rules, not CSS variables)
   ================================================================== */

export const space = {
  gap: 22,
  gridPadLeft: 32,
  padPage: 16,
  padBarH: 8,
  padModal: 14,
  padHeaderTop: 24,
  cardWidth: 225,
};

/* ==================================================================
   Radii
   ================================================================== */

export const radius = {
  pill: 999,              // .mobile-nav:999px
  sm: 4,                  // .sidebar-toggle:4px
  xs: 3,                  // .media-card-tag:3px
  full: '50%',            // .badge-dot, .status-dot
};

/* ==================================================================
   Icon sizes (index.css:917-922)
   ================================================================== */

export const iconSize = {
  xs:  { w: 12, h: 12 },
  sm:  { w: 16, h: 16 },
  md:  { w: 20, h: 20 },
  lg:  { w: 24, h: 24 },
  xl:  { w: 32, h: 32 },
  '2xl': { w: 64, h: 64 },
};

/* ==================================================================
   Composite: everything in one flat object for consumability
   ================================================================== */

export default {
  base,
  accents,
  colors,
  fontFamily,
  fontSize,
  layout,
  space,
  radius,
  iconSize,
};
