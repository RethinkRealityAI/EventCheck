import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Render a full-screen overlay (modal, dialog, drawer, click-outside catcher)
 * as a direct child of <body>.
 *
 * WHY THIS EXISTS
 * `position: fixed` is only relative to the viewport while no ancestor
 * establishes a containing block. `transform`, `filter`, `backdrop-filter`,
 * `perspective`, `contain: paint` and `will-change: transform` all do — and
 * this app's glass cards use `backdrop-blur-*` everywhere. An overlay rendered
 * inside one of those cards is sized and clipped to the CARD: the sponsor
 * detail modal opened from the dashboard's Sponsors tab rendered as a panel
 * trapped inside the table, cut off at the card's edges, with the backdrop
 * covering only part of the page.
 *
 * Whether an overlay breaks depends on where it happens to be mounted, which
 * changes whenever someone moves a component into a new card. Portalling
 * removes the dependency entirely. tests/overlayPortal.test.ts fails the build
 * if a `fixed inset-0` element is rendered anywhere other than inside this
 * component or a createPortal call.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
