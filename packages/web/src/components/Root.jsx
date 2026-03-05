/**
 * @file Root layout component.
 *
 * This component acts as the layout shell for every page in the app.  React
 * Router renders it for the "/" path and injects the matched child route via
 * the `<Outlet>` component.
 *
 * Includes the persistent Header navigation that appears on every page.
 */

import { Outlet } from 'react-router-dom';
import { Header } from './layout/index.js';

/**
 * Layout wrapper rendered by React Router for the root ("/") path.
 * Includes Header and renders child routes into the `<Outlet>` slot.
 *
 * @returns {React.ReactElement} The layout with header and child route content.
 */
export default function Root() {
  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
