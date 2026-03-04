/**
 * @file Tailwind CSS configuration.
 *
 * Tailwind scans the files listed in `content` for class names and generates
 * only the CSS that is actually used, keeping the production bundle small.
 *
 * The `content` array must include every file that can contain Tailwind
 * utility classes -- both the root HTML file (where we might add classes to
 * <body>) and every JS/JSX source file in src/.
 *
 * `theme.extend` is where you would add custom colours, spacing values,
 * breakpoints, etc.  It is left empty for now but ready to be filled in as
 * the design system evolves.
 */
export default {
  /* Glob patterns telling Tailwind where to look for class usage. */
  content: ['./index.html', './src/**/*.{js,jsx}'],

  theme: {
    /* Extend (rather than override) the default Tailwind theme. */
    extend: {}
  },

  /* Third-party Tailwind plugins (e.g. @tailwindcss/forms) go here. */
  plugins: []
};
