import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  FileText,
  Layout,
  Loader2,
  Megaphone,
  PanelLeft,
  Save,
  Tag,
  Undo2,
} from 'lucide-react';
import { CURRENT_SITE } from '../../config/sites';
import { getSiteContent, saveSiteContent, mergeContent } from '../../services/siteContentService';
import { buildCmsPreviewUrl } from '../../utils/cmsPreview';
import { LANDING_DEFAULTS, PORTAL_DEFAULTS } from '../Portal/content/landingDefaults';
import type { LandingContent, PortalContent } from '../../types';
import { useNotifications } from '../NotificationSystem';
import { LandingEditor } from './LandingEditor';
import { PortalEditor } from './PortalEditor';
import { PricingFeesEditor } from './PricingFeesEditor';
import { CmsLivePreview, type PreviewDevice } from './CmsLivePreview';
import { useCmsPreviewChannel } from './useCmsPreviewChannel';
import { CmsButton, CmsSpinner } from './cmsUi';

type TabKey = 'landing' | 'portal' | 'pricing';

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode; blurb: string }> = [
  { key: 'landing', label: 'Landing Page', icon: <Layout className="h-4 w-4" />, blurb: 'Hero, FAQs, registration copy' },
  { key: 'portal', label: 'Portal & Announcements', icon: <Megaphone className="h-4 w-4" />, blurb: 'Dashboard feed + quick links' },
  { key: 'pricing', label: 'Pricing & Fees', icon: <Tag className="h-4 w-4" />, blurb: 'Fees table + early-bird pill' },
];

const PREVIEW_OPEN_KEY = 'cms-preview-open';
const PREVIEW_SPLIT_KEY = 'cms-preview-split';
const PREVIEW_DEVICE_KEY = 'cms-preview-device';
const MIN_EDITOR_PCT = 32;
const MAX_EDITOR_PCT = 72;
const DEFAULT_EDITOR_PCT = 46;

/** Landing + Pricing tabs share the `landing` site_content page. */
function contentPageFor(tab: TabKey): 'landing' | 'portal' {
  return tab === 'portal' ? 'portal' : 'landing';
}

function snapshotsEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function readStoredNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function readStoredDevice(): PreviewDevice {
  try {
    const v = localStorage.getItem(PREVIEW_DEVICE_KEY);
    if (v === 'tablet' || v === 'mobile' || v === 'desktop') return v;
  } catch { /* ignore */ }
  return 'desktop';
}

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}

export function ContentCms() {
  const { showNotification } = useNotifications();

  const [landingDraft, setLandingDraft] = useState<LandingContent>(LANDING_DEFAULTS);
  const [portalDraft, setPortalDraft] = useState<PortalContent>(PORTAL_DEFAULTS);
  const [publishedLanding, setPublishedLanding] = useState<LandingContent>(LANDING_DEFAULTS);
  const [publishedPortal, setPublishedPortal] = useState<PortalContent>(PORTAL_DEFAULTS);
  const [activeTab, setActiveTab] = useState<TabKey>('landing');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(() =>
    typeof window !== 'undefined' ? readStoredBool(PREVIEW_OPEN_KEY, !isNarrowViewport()) : true,
  );
  const [editorPct, setEditorPct] = useState(() =>
    Math.min(MAX_EDITOR_PCT, Math.max(MIN_EDITOR_PCT, readStoredNumber(PREVIEW_SPLIT_KEY, DEFAULT_EDITOR_PCT))),
  );
  const [device, setDevice] = useState<PreviewDevice>(readStoredDevice);
  const [narrow, setNarrow] = useState(isNarrowViewport);

  const splitDragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const landingDirty = !snapshotsEqual(landingDraft, publishedLanding);
  const portalDirty = !snapshotsEqual(portalDraft, publishedPortal);
  const tabDirty = activeTab === 'portal' ? portalDirty : landingDirty;

  const previewPage = contentPageFor(activeTab);
  const previewContent = activeTab === 'portal' ? portalDraft : landingDraft;
  const previewVisible = previewOpen;

  const { connected: previewConnected, syncKey, disconnect } = useCmsPreviewChannel(
    previewPage,
    previewContent,
    previewVisible,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [landingOv, portalOv] = await Promise.all([
          getSiteContent(CURRENT_SITE.key, 'landing'),
          getSiteContent(CURRENT_SITE.key, 'portal'),
        ]);
        if (cancelled) return;
        const landing = mergeContent(LANDING_DEFAULTS, landingOv);
        const portal = mergeContent(PORTAL_DEFAULTS, portalOv);
        setLandingDraft(landing);
        setPortalDraft(portal);
        setPublishedLanding(landing);
        setPublishedPortal(portal);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'unknown error';
        showNotification(`Failed to load content: ${message}`, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PREVIEW_OPEN_KEY, previewOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [previewOpen]);

  useEffect(() => {
    try { localStorage.setItem(PREVIEW_SPLIT_KEY, String(editorPct)); } catch { /* ignore */ }
  }, [editorPct]);

  useEffect(() => {
    try { localStorage.setItem(PREVIEW_DEVICE_KEY, device); } catch { /* ignore */ }
  }, [device]);

  const handleDiscard = () => {
    if (activeTab === 'portal') setPortalDraft(publishedPortal);
    else setLandingDraft(publishedLanding);
    showNotification('Discarded unsaved changes', 'success');
  };

  const handlePublish = async () => {
    setPublishing(true);
    const page = contentPageFor(activeTab);
    const content = page === 'portal' ? portalDraft : landingDraft;
    const ok = await saveSiteContent(CURRENT_SITE.key, page, content);
    setPublishing(false);
    if (ok) {
      if (page === 'portal') setPublishedPortal(portalDraft);
      else setPublishedLanding(landingDraft);
      showNotification('Published — live site updated', 'success');
    } else {
      showNotification('Failed to publish — check your connection and try again', 'error');
    }
  };

  const onSplitPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    splitDragRef.current = { startX: e.clientX, startPct: editorPct };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSplitPointerMove = (e: React.PointerEvent) => {
    if (!splitDragRef.current || !shellRef.current) return;
    const width = shellRef.current.getBoundingClientRect().width;
    if (width <= 0) return;
    const deltaPct = ((e.clientX - splitDragRef.current.startX) / width) * 100;
    setEditorPct(Math.min(
      MAX_EDITOR_PCT,
      Math.max(MIN_EDITOR_PCT, splitDragRef.current.startPct + deltaPct),
    ));
  };

  const endSplitDrag = (e: React.PointerEvent) => {
    splitDragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
  };

  const previewHashUrl = useMemo(() => buildCmsPreviewUrl(activeTab), [activeTab]);
  const activeTabMeta = TABS.find((t) => t.key === activeTab)!;

  const dirtyDots = useMemo(
    () => ({ landing: landingDirty, portal: portalDirty, pricing: landingDirty }),
    [landingDirty, portalDirty],
  );

  // Desktop: side-by-side. Narrow: preview replaces the editor (single panel).
  const showDesktopSplit = previewOpen && !narrow;
  const showMobilePreview = previewOpen && narrow;
  const showEditor = !showMobilePreview;

  const editorPane = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex-shrink-0 overflow-x-auto border-b border-slate-200/80 bg-white px-2 sm:px-4">
        <div className="flex min-w-max gap-1">
          {TABS.map((t) => {
            const active = activeTab === t.key;
            const dirty = dirtyDots[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3.5 text-sm font-semibold transition ${
                  active
                    ? 'border-[#2260a1] text-[#1a4880]'
                    : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {t.icon}
                {t.label}
                {dirty && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" title="Unsaved changes" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        {loading ? (
          <CmsSpinner label="Loading published content…" />
        ) : (
          <div className="mx-auto max-w-3xl">
            {activeTab === 'landing' && <LandingEditor draft={landingDraft} onChange={setLandingDraft} />}
            {activeTab === 'portal' && <PortalEditor draft={portalDraft} onChange={setPortalDraft} />}
            {activeTab === 'pricing' && <PricingFeesEditor draft={landingDraft} onChange={setLandingDraft} />}
          </div>
        )}
      </div>
    </div>
  );

  const previewPane = (
    <CmsLivePreview
      url={previewHashUrl}
      pageLabel={activeTabMeta.label}
      device={device}
      onDeviceChange={setDevice}
      connected={previewConnected}
      syncKey={syncKey}
      onIframeUnload={disconnect}
    />
  );

  return (
    <div
      ref={shellRef}
      className="-m-4 flex h-[calc(100dvh-7.5rem)] flex-col overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] lg:-m-6 lg:h-dvh"
    >
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gansid-primary-gradient text-white shadow-lg ring-1 ring-white/20">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">Content CMS</h2>
              {tabDirty && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                  Unsaved
                </span>
              )}
              {previewOpen && previewConnected && (
                <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Live
                </span>
              )}
            </div>
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              {activeTabMeta.blurb}
              {previewOpen ? ' · preview updates as you edit' : ' · preview hidden'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CmsButton variant="secondary" onClick={() => setPreviewOpen((o) => !o)} className="!px-3">
            {narrow && previewOpen ? (
              <PanelLeft className="h-4 w-4" />
            ) : previewOpen ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {narrow
                ? (previewOpen ? 'Back to editor' : 'Preview')
                : (previewOpen ? 'Hide preview' : 'Show preview')}
            </span>
          </CmsButton>
          <CmsButton variant="secondary" onClick={handleDiscard} disabled={!tabDirty || publishing}>
            <Undo2 className="h-4 w-4" />
            <span className="hidden sm:inline">Discard</span>
          </CmsButton>
          <CmsButton variant="primary" onClick={handlePublish} disabled={publishing || !tabDirty}>
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Publish
          </CmsButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {showEditor && (
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={showDesktopSplit ? { width: `${editorPct}%` } : { width: '100%' }}
          >
            {editorPane}
          </div>
        )}

        {showDesktopSplit && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize editor and preview"
              aria-valuenow={Math.round(editorPct)}
              aria-valuemin={MIN_EDITOR_PCT}
              aria-valuemax={MAX_EDITOR_PCT}
              tabIndex={0}
              onPointerDown={onSplitPointerDown}
              onPointerMove={onSplitPointerMove}
              onPointerUp={endSplitDrag}
              onPointerCancel={endSplitDrag}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setEditorPct((p) => Math.max(MIN_EDITOR_PCT, p - 2));
                if (e.key === 'ArrowRight') setEditorPct((p) => Math.min(MAX_EDITOR_PCT, p + 2));
              }}
              className="group relative z-10 w-1.5 flex-shrink-0 cursor-col-resize bg-slate-200/90 transition-colors hover:bg-[#2260a1]/45 focus:bg-[#2260a1]/55 focus:outline-none"
            >
              <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
              <span className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100" />
            </div>
            <div className="min-h-0 min-w-0 flex-1">{previewPane}</div>
          </>
        )}

        {showMobilePreview && (
          <div className="min-h-0 min-w-0 flex-1">{previewPane}</div>
        )}
      </div>
    </div>
  );
}

export default ContentCms;
