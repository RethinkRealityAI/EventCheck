import React, { useEffect, useRef, useState } from 'react';
import { Eye, Save, Undo2 } from 'lucide-react';
import { CURRENT_SITE } from '../../config/sites';
import { getSiteContent, saveSiteContent, mergeContent } from '../../services/siteContentService';
import { LANDING_DEFAULTS, PORTAL_DEFAULTS } from '../Portal/content/landingDefaults';
import type { LandingContent, PortalContent } from '../../types';
import { useNotifications } from '../NotificationSystem';
import { IframeViewer } from '../Portal/ui/IframeViewer';
import { LandingEditor } from './LandingEditor';
import { PortalEditor } from './PortalEditor';
import { PricingFeesEditor } from './PricingFeesEditor';

type TabKey = 'landing' | 'portal' | 'pricing';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'landing', label: 'Landing Page' },
  { key: 'portal', label: 'Portal & Announcements' },
  { key: 'pricing', label: 'Pricing & Fees' },
];

// Both 'landing' and 'pricing' tabs edit the LandingContent page — pricing
// (fees/pricingPromo) lives inside the same site_content('landing') row.
function previewPageFor(tab: TabKey): 'landing' | 'portal' {
  return tab === 'portal' ? 'portal' : 'landing';
}

function contentPageFor(tab: TabKey): 'landing' | 'portal' {
  return tab === 'portal' ? 'portal' : 'landing';
}

export function ContentCms() {
  const { showNotification } = useNotifications();

  const [landingDraft, setLandingDraft] = useState<LandingContent>(LANDING_DEFAULTS);
  const [portalDraft, setPortalDraft] = useState<PortalContent>(PORTAL_DEFAULTS);
  const [activeTab, setActiveTab] = useState<TabKey>('landing');
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewWindowRef = useRef<Window | null>(null);

  const activeDraftFor = (tab: TabKey): LandingContent | PortalContent =>
    tab === 'portal' ? portalDraft : landingDraft;

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const [landingOv, portalOv] = await Promise.all([
        getSiteContent(CURRENT_SITE.key, 'landing'),
        getSiteContent(CURRENT_SITE.key, 'portal'),
      ]);
      setLandingDraft(mergeContent(LANDING_DEFAULTS, landingOv));
      setPortalDraft(mergeContent(PORTAL_DEFAULTS, portalOv));
    } catch (err: any) {
      showNotification(`Failed to load content: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Preview handshake -----------------------------------------------
  // The preview iframe (Landing/PortalLayout wrapped in ContentProvider
  // previewMode) posts 'cms-preview-ready' once mounted; we reply with the
  // active tab's draft. Any later draft edit while the preview is open is
  // streamed the same way so the iframe updates live.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'cms-preview-ready') {
        previewWindowRef.current = e.source as Window;
        (e.source as Window)?.postMessage(
          { type: 'cms-preview', page: previewPageFor(activeTab), content: activeDraftFor(activeTab) },
          window.location.origin,
        );
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, landingDraft, portalDraft]);

  useEffect(() => {
    if (!previewWindowRef.current) return;
    previewWindowRef.current.postMessage(
      { type: 'cms-preview', page: previewPageFor(activeTab), content: activeDraftFor(activeTab) },
      window.location.origin,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landingDraft, portalDraft, activeTab]);

  const handleClosePreview = () => {
    setPreviewOpen(false);
    previewWindowRef.current = null;
  };

  const handleDiscard = async () => {
    await loadDrafts();
    showNotification('Discarded unsaved changes', 'success');
  };

  const handlePublish = async () => {
    const page = contentPageFor(activeTab);
    const content = page === 'portal' ? portalDraft : landingDraft;
    const ok = await saveSiteContent(CURRENT_SITE.key, page, content);
    if (ok) {
      showNotification('Published successfully', 'success');
    } else {
      showNotification('Failed to publish — please try again', 'error');
    }
  };

  const previewUrl = `${window.location.origin}/#/${activeTab === 'portal' ? 'portal' : ''}?cmsPreview=1`;

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Content</h2>
          <p className="text-gray-500 text-xs">Edit landing page, portal, and pricing copy — publish when ready.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-700 text-sm font-semibold transition shadow-sm bg-white border border-gray-300 hover:bg-gray-50"
          >
            <Undo2 className="w-4 h-4" />
            Discard
          </button>
          <button
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-700 text-sm font-semibold transition shadow-sm bg-white border border-gray-300 hover:bg-gray-50"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={handlePublish}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-semibold transition shadow-sm bg-gray-900 hover:bg-gray-800"
          >
            <Save className="w-4 h-4" />
            Publish
          </button>
        </div>
      </header>

      {/* Top tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="max-w-3xl mx-auto text-center text-gray-400 text-sm py-12">Loading content…</div>
        ) : (
          <>
            {activeTab === 'landing' && <LandingEditor draft={landingDraft} onChange={setLandingDraft} />}
            {activeTab === 'portal' && <PortalEditor draft={portalDraft} onChange={setPortalDraft} />}
            {activeTab === 'pricing' && <PricingFeesEditor draft={landingDraft} onChange={setLandingDraft} />}
          </>
        )}
      </div>

      {previewOpen && (
        <IframeViewer url={previewUrl} title="Content preview" onClose={handleClosePreview} />
      )}
    </div>
  );
}

export default ContentCms;
