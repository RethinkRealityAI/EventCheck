import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { CURRENT_SITE } from '../../../config/sites';
import { getSiteContent, mergeContent } from '../../../services/siteContentService';
import { LANDING_DEFAULTS, PORTAL_DEFAULTS } from './landingDefaults';
import type { LandingContent, PortalContent } from '../../../types';

interface Ctx { landing: LandingContent; portal: PortalContent; }
const ContentContext = createContext<Ctx>({ landing: LANDING_DEFAULTS, portal: PORTAL_DEFAULTS });

export function useLandingContent() { return useContext(ContentContext).landing; }
export function usePortalContent() { return useContext(ContentContext).portal; }

// previewMode: when true, skip the DB fetch and render content received via
// postMessage from the CMS editor parent (live preview). Otherwise fetch the
// published content from site_content and merge over defaults.
export function ContentProvider({ children, previewMode = false }: { children: ReactNode; previewMode?: boolean }) {
  const [landingOv, setLandingOv] = useState<Record<string, unknown>>({});
  const [portalOv, setPortalOv] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (previewMode) return;
    getSiteContent(CURRENT_SITE.key, 'landing').then(setLandingOv);
    getSiteContent(CURRENT_SITE.key, 'portal').then(setPortalOv);
  }, [previewMode]);

  useEffect(() => {
    if (!previewMode) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return; // same-origin only
      if (e.data?.type === 'cms-preview') {
        const payload = e.data.content;
        const ov =
          payload && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};
        if (e.data.page === 'landing') setLandingOv(ov);
        if (e.data.page === 'portal') setPortalOv(ov);
      }
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'cms-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, [previewMode]);

  const value: Ctx = {
    landing: mergeContent(LANDING_DEFAULTS, landingOv),
    portal: mergeContent(PORTAL_DEFAULTS, portalOv),
  };
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
