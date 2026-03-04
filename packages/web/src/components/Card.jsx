/**
 * @file Reusable media card component.
 *
 * Card is the visual building block for the media grid on the Dashboard.
 * Each card represents a single media item (video) and displays its
 * thumbnail as a CSS background image.  Child content (title overlay,
 * duration badge, action buttons, etc.) is projected via the `children`
 * prop, keeping the card itself layout-agnostic.
 *
 * Design notes:
 *  - Fixed dimensions (h-96 w-72 ≈ 384 x 288 px) give the grid a uniform
 *    look.  These can be made responsive later.
 *  - `bg-cover bg-center` ensures the thumbnail fills the card without
 *    distortion regardless of the source image's aspect ratio.
 */

import React from 'react';

/**
 * A fixed-size card with an optional background image.
 *
 * @param {Object}      props            - Component props.
 * @param {string}      [props.imageUrl] - URL for the card's background
 *   thumbnail.  When omitted the card renders with a transparent background
 *   (useful as a placeholder or loading state).
 * @param {React.ReactNode} props.children - Content rendered inside the card
 *   (overlays, badges, buttons, etc.).
 * @returns {React.ReactElement} The rendered card element.
 */
export default function Card({ children, imageUrl }) {
  return (
    <div
      className="h-96 w-72 rounded-lg bg-cover bg-center"
      /* Inline style is used for the background image because Tailwind
         does not support dynamic URLs in its utility classes.  When no
         imageUrl is provided we pass an empty style object to avoid
         setting a broken background-image value. */
      style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : {}}
    >
      {children}
    </div>
  );
}
