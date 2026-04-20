import { describe, it, expect } from 'vitest';
import { resolveVisibleTabs, DASHBOARD_TAB_META } from '../components/DashboardTabsConfig';

const ALL_AVAILABLE = { hasExhibitorForms: true, portalEnabled: true };
const SCAGO_LIKE = { hasExhibitorForms: false, portalEnabled: false };

describe('resolveVisibleTabs', () => {
  it('returns default order when prefs is undefined', () => {
    const tabs = resolveVisibleTabs(undefined, ALL_AVAILABLE);
    expect(tabs.map(t => t.id)).toEqual(DASHBOARD_TAB_META.map(m => m.id));
  });

  it('returns default order when prefs has empty order + hidden', () => {
    const tabs = resolveVisibleTabs({ order: [], hidden: [] }, ALL_AVAILABLE);
    expect(tabs.map(t => t.id)).toEqual(DASHBOARD_TAB_META.map(m => m.id));
  });

  it('respects the admin-saved order for tabs it lists', () => {
    const tabs = resolveVisibleTabs(
      { order: ['signups', 'live', 'tables'], hidden: [] },
      ALL_AVAILABLE,
    );
    expect(tabs[0].id).toBe('signups');
    expect(tabs[1].id).toBe('live');
    expect(tabs[2].id).toBe('tables');
  });

  it('appends new tabs not listed in saved order (forward-compat)', () => {
    // Admin saved prefs before a tab was added in code; saved order has only
    // a subset. The unsaved tabs should show up at the end so the new tab is
    // still reachable.
    const tabs = resolveVisibleTabs(
      { order: ['live', 'tables'], hidden: [] },
      ALL_AVAILABLE,
    );
    expect(tabs[0].id).toBe('live');
    expect(tabs[1].id).toBe('tables');
    // Every known default tab should be present
    const ids = new Set(tabs.map(t => t.id));
    for (const meta of DASHBOARD_TAB_META) {
      expect(ids.has(meta.id)).toBe(true);
    }
  });

  it('filters out admin-hidden tabs', () => {
    const tabs = resolveVisibleTabs(
      { order: [], hidden: ['test', 'donated'] },
      ALL_AVAILABLE,
    );
    const ids = tabs.map(t => t.id);
    expect(ids).not.toContain('test');
    expect(ids).not.toContain('donated');
    expect(ids).toContain('live');
  });

  it('excludes exhibitor tab when site has no exhibitor forms', () => {
    const tabs = resolveVisibleTabs(undefined, { hasExhibitorForms: false, portalEnabled: true });
    expect(tabs.find(t => t.id === 'exhibitors')).toBeUndefined();
    expect(tabs.find(t => t.id === 'signups')).toBeDefined();
  });

  it('excludes signups tab on non-portal sites', () => {
    const tabs = resolveVisibleTabs(undefined, { hasExhibitorForms: true, portalEnabled: false });
    expect(tabs.find(t => t.id === 'signups')).toBeUndefined();
    expect(tabs.find(t => t.id === 'exhibitors')).toBeDefined();
  });

  it('excludes both conditional tabs on a SCAGO-like site', () => {
    const tabs = resolveVisibleTabs(undefined, SCAGO_LIKE);
    const ids = tabs.map(t => t.id);
    expect(ids).not.toContain('exhibitors');
    expect(ids).not.toContain('signups');
    // Unconditional tabs still present
    expect(ids).toContain('live');
    expect(ids).toContain('tables');
  });

  it('hidden flag overrides site availability for tabs the site does support', () => {
    // Portal-enabled site + admin hides signups → signups excluded
    const tabs = resolveVisibleTabs(
      { order: [], hidden: ['signups'] },
      { hasExhibitorForms: true, portalEnabled: true },
    );
    expect(tabs.find(t => t.id === 'signups')).toBeUndefined();
  });

  it('silently drops unknown ids from saved order (e.g. tab removed in code later)', () => {
    const tabs = resolveVisibleTabs(
      { order: ['live', 'nonexistent_tab', 'tables'], hidden: [] },
      ALL_AVAILABLE,
    );
    const ids = tabs.map(t => t.id);
    expect(ids).toContain('live');
    expect(ids).toContain('tables');
    expect(ids).not.toContain('nonexistent_tab');
  });

  it('does not duplicate tabs when saved order contains repeats', () => {
    const tabs = resolveVisibleTabs(
      { order: ['live', 'live', 'tables'], hidden: [] },
      ALL_AVAILABLE,
    );
    const liveOccurrences = tabs.filter(t => t.id === 'live').length;
    expect(liveOccurrences).toBe(1);
  });
});
