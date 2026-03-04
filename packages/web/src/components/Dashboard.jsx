/**
 * @file Dashboard page component.
 *
 * This is the main landing page of the application -- the first thing the
 * user sees after being redirected from "/".  It will eventually display the
 * full media library (grid of Cards, search/filter controls, scan button,
 * etc.).
 *
 * For now it renders a minimal placeholder so that the routing and layout
 * layers can be verified end-to-end.
 */

import React from 'react';

/**
 * Renders the media library dashboard.
 *
 * Uses a full-height dark background (`min-h-screen bg-gray-900`) to
 * establish the app's dark-mode aesthetic from the start.
 *
 * @returns {React.ReactElement} The dashboard page.
 */
export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Page title -- will eventually sit alongside action buttons
          (e.g. "Scan directory", "Refresh"). */}
      <h1 className="text-3xl font-bold mb-6">Photo Quest</h1>

      {/* Subtitle placeholder -- will be replaced by actual media grid
          and status information. */}
      <p className="text-gray-400">Media library dashboard</p>
    </div>
  );
}
