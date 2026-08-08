/**
 * @file React Native compatible config.
 *
 * Same shape as config.js but without node:fs. Metro resolves
 * .native.js before .js for mobile/web builds. Node.js server
 * still uses the original config.js via the package.json exports map.
 */

const DEFAULTS = {
  serverPort: 7837,
  webappPort: 7838,
};

const config = { ...DEFAULTS };

export default config;
