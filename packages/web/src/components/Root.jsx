/**
 * @file Root layout component.
 *
 * This component acts as the layout shell for every page in the app.  React
 * Router renders it for the "/" path and injects the matched child route via
 * the `<Outlet>` component.
 *
 * Right now it is a pass-through -- it renders nothing of its own and simply
 * delegates to the child route.  As the app grows this is where you would add
 * persistent chrome such as a navigation bar, sidebar, or footer that should
 * appear on every page.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Layout wrapper rendered by React Router for the root ("/") path.
 * Child routes are rendered into the `<Outlet>` slot.
 *
 * @returns {React.ReactElement} The child route's element (via Outlet).
 */
export default function Root() {
  return <Outlet />;
}
