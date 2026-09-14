import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronUp, ChevronDown, Eye, EyeOff, RotateCcw, Loader2 } from 'lucide-react';
import type { AppSettings } from '../types';

export type DashboardTabId =
  | 'live'
  | 'donated'
  | 'tables'
  | 'sponsors'
  | 'sponsor-tickets'
  | 'groups'
  | 'speakers'
  | 'test'
  | 'exhibitors'
  | 'signups'
  | 'contacts';

export interface DashboardTabMeta {
  id: DashboardTabId;
  label: string;
  description: string;
  /** When true, the tab only appears if the site has at least one exhibitor form. */
  requiresExhibitorForms?: boolean;
  /** When true, the tab only appears on portal-enabled deployments (GANSID). */
  requiresPortal?: boolean;
  /** When true, the tab only appears when at least one attendee row has
   *  `guestType='speaker'` — keeps the tab from cluttering forms that
   *  don't use the speaker promo flow. */
  requiresSpeakerData?: boolean;
  /** When true, the tab only appears once the site has a sponsor form or at
   *  least one sponsor booking — a gala with no sponsorship programme never
   *  sees it. */
  requiresSponsorData?: boolean;
}

/** Every gate a tab can be conditioned on. Computed once by the dashboard
 *  from the loaded forms + attendees and threaded to both the tab strip and
 *  the customise dialog, so "Not on this site" always agrees with what is
 *  actually rendered. */
export interface DashboardTabGates {
  hasExhibitorForms: boolean;
  portalEnabled: boolean;
  hasSpeakers?: boolean;
  hasSponsorData?: boolean;
}

/** True when a tab cannot appear on this site regardless of admin prefs. */
export function isTabUnavailable(meta: DashboardTabMeta, gates: DashboardTabGates): boolean {
  if (meta.requiresExhibitorForms && !gates.hasExhibitorForms) return true;
  if (meta.requiresPortal && !gates.portalEnabled) return true;
  if (meta.requiresSpeakerData && !gates.hasSpeakers) return true;
  if (meta.requiresSponsorData && !gates.hasSponsorData) return true;
  return false;
}

/** Default display order — matches the order the tabs had before this feature landed.
 *  New tabs should be appended here to preserve existing admin preferences. */
export const DASHBOARD_TAB_META: readonly DashboardTabMeta[] = [
  { id: 'live', label: 'Live', description: 'Everyone registered — attendees, sponsor & exhibitor delegates, org bookings' },
  { id: 'donated', label: 'Donations', description: 'Donated seats or tables' },
  { id: 'tables', label: 'Tables', description: 'Grouped table view' },
  { id: 'sponsors', label: 'Sponsors', description: 'Sponsor bookings — tier, items, payment status, delegation', requiresSponsorData: true },
  { id: 'sponsor-tickets', label: 'Sponsor Tickets', description: 'Guest seats from sponsor purchases' },
  { id: 'groups', label: 'Groups', description: 'Group-registration primaries + their guests' },
  { id: 'speakers', label: 'Speakers', description: 'Registrants tagged as Speaker (via promo code or admin-issued)', requiresSpeakerData: true },
  { id: 'test', label: 'Test', description: 'Form-preview submissions' },
  { id: 'exhibitors', label: 'Exhibitors', description: 'Exhibitor org + staff rows', requiresExhibitorForms: true },
  { id: 'signups', label: 'Signups', description: 'Portal users + registration progress', requiresPortal: true },
  { id: 'contacts', label: 'Contacts', description: 'Bulk-imported contacts + email campaigns' },
];

/** Resolve the ordered list of tabs to render, honoring both site-availability
 *  gates AND admin preferences (order + hidden). Pure — no React state. */
export function resolveVisibleTabs(
  prefs: AppSettings['dashboardTabPrefs'] | undefined,
  gates: DashboardTabGates,
): DashboardTabMeta[] {
  const knownIds = new Set(DASHBOARD_TAB_META.map(m => m.id));
  const metaById = new Map(DASHBOARD_TAB_META.map(m => [m.id, m]));

  // Honor the admin's saved order, then append any tabs that exist today but
  // aren't in the saved order (usually means a new tab was added in code
  // after the prefs were last saved).
  const orderedIds: DashboardTabId[] = [];
  for (const id of (prefs?.order ?? [])) {
    if (knownIds.has(id as DashboardTabId) && !orderedIds.includes(id as DashboardTabId)) {
      orderedIds.push(id as DashboardTabId);
    }
  }
  for (const m of DASHBOARD_TAB_META) {
    if (!orderedIds.includes(m.id)) orderedIds.push(m.id);
  }

  const hidden = new Set(prefs?.hidden ?? []);
  return orderedIds
    .map(id => metaById.get(id)!)
    .filter(m => !hidden.has(m.id) && !isTabUnavailable(m, gates));
}

interface Props {
  settings: AppSettings;
  gates: DashboardTabGates;
  onSave: (next: AppSettings['dashboardTabPrefs']) => Promise<void>;
  onClose: () => void;
}

export default function DashboardTabsConfig({ settings, gates, onSave, onClose }: Props) {
  // Local draft of the order; starts from the same resolution logic the
  // dashboard uses, minus availability filtering (admins should see tabs that
  // are available today so they can reorder them, not tabs that don't apply
  // to this site at all).
  const initialOrder: DashboardTabId[] = (() => {
    const saved = (settings.dashboardTabPrefs?.order ?? [])
      .filter(id => DASHBOARD_TAB_META.some(m => m.id === id)) as DashboardTabId[];
    const extras = DASHBOARD_TAB_META
      .map(m => m.id)
      .filter(id => !saved.includes(id));
    return [...saved, ...extras];
  })();

  const [order, setOrder] = useState<DashboardTabId[]>(initialOrder);
  const [hidden, setHidden] = useState<Set<DashboardTabId>>(
    new Set((settings.dashboardTabPrefs?.hidden ?? []) as DashboardTabId[]),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const metaById = new Map(DASHBOARD_TAB_META.map(m => [m.id, m] as const));

  const move = (id: DashboardTabId, dir: -1 | 1) => {
    setOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = prev.slice();
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const toggleHidden = (id: DashboardTabId) => {
    setHidden(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id); else copy.add(id);
      return copy;
    });
  };

  const resetDefaults = () => {
    setOrder(DASHBOARD_TAB_META.map(m => m.id));
    setHidden(new Set());
  };

  const handleSave = async () => {
    setError(''); setSaving(true);
    try {
      await onSave({ order, hidden: Array.from(hidden) });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // Render via portal to document.body so ancestor `backdrop-filter`/`transform`
  // containers (which establish a new containing block) don't clip the
  // viewport-covering overlay.
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Dashboard tabs</h2>
            <p className="text-xs text-gray-500">Reorder or hide tabs. Changes apply to everyone on this deployment.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-2">
          {order.map((id, idx) => {
            const meta = metaById.get(id);
            if (!meta) return null;
            const isHidden = hidden.has(id);
            const unavailable = isTabUnavailable(meta, gates);
            return (
              <div
                key={id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                  isHidden ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => move(id, -1)}
                    disabled={idx === 0}
                    className="p-0.5 rounded text-gray-500 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move ${meta.label} up`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => move(id, 1)}
                    disabled={idx === order.length - 1}
                    className="p-0.5 rounded text-gray-500 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move ${meta.label} down`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    {meta.label}
                    {unavailable && (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                        Not on this site
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{meta.description}</div>
                </div>
                <button
                  onClick={() => toggleHidden(id)}
                  className={`p-1.5 rounded-md border transition ${
                    isHidden
                      ? 'border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-indigo-600'
                      : 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  }`}
                  title={isHidden ? 'Tab is hidden — click to show' : 'Tab is visible — click to hide'}
                  aria-label={isHidden ? 'Show tab' : 'Hide tab'}
                >
                  {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            );
          })}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mt-3">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
          <button
            onClick={resetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            title="Restore default order and show all tabs"
          >
            <RotateCcw className="w-4 h-4" /> Reset to defaults
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition ${saving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save layout'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
