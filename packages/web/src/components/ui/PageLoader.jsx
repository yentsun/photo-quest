/**
 * @file Full-page loading indicator — the single loader used across all pages.
 *
 * All page-level loading states must use this component so the visual and
 * messaging experience is consistent.  The `message` prop is required and must
 * be specific: tell the user *what* is loading, not just "Loading…".
 */

import Spinner from './Spinner.jsx';

/**
 * Full-viewport-height centred loading indicator.
 *
 * @param {Object}  props
 * @param {string}  props.message - Specific status message, e.g. "Loading 'Vacation 2024'…"
 */
export default function PageLoader({ message }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Spinner size="lg" />
      <p className="text-gray-200 text-sm font-medium tracking-wide">{message}</p>
    </div>
  );
}
