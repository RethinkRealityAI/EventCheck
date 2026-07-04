import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 140;

/**
 * Parent-side postMessage channel for the CMS live-preview iframe.
 * Single handshake path: child posts `cms-preview-ready`, parent pushes draft.
 */
export function useCmsPreviewChannel<TPage extends string>(
  page: TPage,
  content: unknown,
  enabled: boolean,
) {
  const previewWindowRef = useRef<Window | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const pageRef = useRef(page);
  const contentRef = useRef(content);
  const [connected, setConnected] = useState(false);
  const [syncKey, setSyncKey] = useState(0);

  pageRef.current = page;
  contentRef.current = content;

  const push = useCallback((win: Window) => {
    win.postMessage(
      { type: 'cms-preview', page: pageRef.current, content: contentRef.current },
      window.location.origin,
    );
    setSyncKey((k) => k + 1);
  }, []);

  const disconnect = useCallback(() => {
    previewWindowRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== 'cms-preview-ready') return;
      const win = e.source as Window;
      previewWindowRef.current = win;
      setConnected(true);
      push(win);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [enabled, push, disconnect]);

  // Debounced live updates while the iframe is connected
  useEffect(() => {
    if (!enabled || !previewWindowRef.current) return;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (!previewWindowRef.current) return;
      push(previewWindowRef.current);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(debounceRef.current);
  }, [enabled, page, content, push]);

  return { connected, syncKey, disconnect };
}
