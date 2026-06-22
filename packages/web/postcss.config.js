/**
 * @file PostCSS configuration.
 *
 * PostCSS is the CSS processing pipeline that Vite uses under the hood.
 * Two plugins are enabled here:
 *
 *  1. **tailwindcss** -- runs the Tailwind compiler, which reads the
 *     tailwind.config.js, scans source files for utility class usage, and
 *     generates the corresponding CSS.
 *
 *  2. **autoprefixer** -- automatically adds vendor prefixes (e.g.
 *     -webkit-, -moz-) based on the project's browserslist config, so we
 *     never have to write them by hand.
 *
 * Plugin entries are specified as keys with empty-object values, which means
 * "use default options".
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
