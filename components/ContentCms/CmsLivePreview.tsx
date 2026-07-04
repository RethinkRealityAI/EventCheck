import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from 'lucide-react';

export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTH: Record<PreviewDevice, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

const DEVICE_LABEL: Record<PreviewDevice, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Phone',
};

export function CmsLivePreview({
  url,
  pageLabel,
  device,
  onDeviceChange,
  connected,
  syncKey,
  onIframeUnload,
}: {
  url: string;
  pageLabel: string;
  device: PreviewDevice;
  onDeviceChange: (d: PreviewDevice) => void;
  connected: boolean;
  /** Increments on each content push — drives the subtle sync indicator. */
  syncKey: number;
  onIframeUnload: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const [updating, setUpdating] = useState(false);
  const updateTimer = useRef<number | undefined>(undefined);
  const lastSync = useRef(syncKey);

  useEffect(() => {
    if (!connected || syncKey === lastSync.current) return;
    lastSync.current = syncKey;
    setUpdating(true);
    window.clearTimeout(updateTimer.current);
    updateTimer.current = window.setTimeout(() => setUpdating(false), 320);
    return () => window.clearTimeout(updateTimer.current);
  }, [syncKey, connected]);

  useEffect(() => {
    setLoading(true);
    onIframeUnload();
  }, [url, frameKey, onIframeUnload]);

  const refresh = () => {
    onIframeUnload();
    setLoading(true);
    setFrameKey((k) => k + 1);
  };

  const devices: Array<{ id: PreviewDevice; icon: React.ReactNode }> = [
    { id: 'desktop', icon: <Monitor className="h-4 w-4" /> },
    { id: 'tablet', icon: <Tablet className="h-4 w-4" /> },
    { id: 'mobile', icon: <Smartphone className="h-4 w-4" /> },
  ];

  const displayPath = url.includes('#')
    ? url.slice(url.indexOf('#'))
    : url.replace(typeof window !== 'undefined' ? window.location.origin : '', '');

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(165deg,#0f172a_0%,#1e293b_45%,#0f172a_100%)]">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-slate-500'
            }`}
            title={connected ? 'Preview connected' : 'Connecting…'}
          >
            {connected && (
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-[0.14em] text-white/90">
                Live preview
              </span>
              {(loading || updating) && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300/80" />
              )}
              {updating && !loading && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
                  Syncing
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-white/45">{pageLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                title={DEVICE_LABEL[d.id]}
                onClick={() => onDeviceChange(d.id)}
                className={`rounded-md p-1.5 transition ${
                  device === d.id
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/45 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                {d.icon}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            title="Reload preview"
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '20px 20px',
          }}
          aria-hidden
        />

        <div className="relative flex h-full items-stretch justify-center">
          <div
            className="flex h-full max-h-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)] ring-1 ring-white/20 transition-[width,max-width] duration-300 ease-out"
            style={{
              width: DEVICE_WIDTH[device],
              maxWidth: '100%',
            }}
          >
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-200/80 bg-slate-50 px-3 py-2">
              <div className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="min-w-0 flex-1 truncate rounded-md bg-white px-2.5 py-1 text-[10px] font-medium text-slate-400 ring-1 ring-slate-200/80">
                {displayPath}
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-white">
              {loading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-[2px]">
                  <Loader2 className="h-8 w-8 animate-spin text-[#2260a1]" />
                  <p className="font-display text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Loading preview
                  </p>
                </div>
              )}
              <iframe
                key={`${url}-${frameKey}`}
                src={url}
                title={`Live preview — ${pageLabel}`}
                className="h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={() => setLoading(false)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
