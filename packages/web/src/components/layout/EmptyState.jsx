/**
 * @file Empty state placeholder with action button.
 */

import { Button } from '../ui/index.js';

/**
 * Centered placeholder shown when there's no content.
 *
 * @param {Object} props
 * @param {string} props.title - Heading text
 * @param {string} [props.description] - Subtext description
 * @param {Object} [props.action] - Action button config
 * @param {string} props.action.label - Button text
 * @param {Function} props.action.onClick - Button click handler
 * @param {React.ReactNode} [props.icon] - Optional icon element
 */
export default function EmptyState({
  title,
  description,
  action,
  icon,
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
      {icon && (
        <div className="text-gray-500 mb-4">
          {icon}
        </div>
      )}
      <h2 className="text-xl font-semibold text-white mb-2">
        {title}
      </h2>
      {description && (
        <p className="text-gray-400 mb-6 max-w-md">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
