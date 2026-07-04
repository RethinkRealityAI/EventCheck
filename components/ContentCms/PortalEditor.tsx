import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { CURRENT_SITE } from '../../config/sites';
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../../services/announcementService';
import type { Announcement, PortalContent, SidebarLink } from '../../types';
import { PORTAL_DEFAULTS } from '../Portal/content/landingDefaults';
import { useNotifications } from '../NotificationSystem';
import { PlainField } from './fields/PlainField';
import { RichField } from './fields/RichField';
import { ColorField } from './fields/ColorField';
import { RepeaterField } from './fields/RepeaterField';
import { ImageUploadField } from './fields/ImageUploadField';
import {
  CmsButton,
  CmsPageHeader,
  CmsSelect,
  CmsToggle,
  SectionCard,
} from './cmsUi';

function emptyAnnouncement(): Partial<Announcement> {
  return { isActive: true, ctaMode: 'none', style: 'card', accentColor: '#ba0028' };
}

export function PortalEditor({
  draft,
  onChange,
}: {
  draft: PortalContent;
  onChange: (d: PortalContent) => void;
}) {
  const site = CURRENT_SITE.key;
  const { showNotification } = useNotifications();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const refresh = async () => {
    setLoadingList(true);
    setAnnouncements(await listAnnouncements(site));
    setLoadingList(false);
  };
  useEffect(() => { refresh(); }, [site]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const saveAnnouncement = async () => {
    if (!editing?.title?.trim()) {
      showNotification('Title is required', 'error');
      return;
    }
    if (editing.id) {
      const saved = await updateAnnouncement(editing.id, editing);
      if (!saved) {
        showNotification('Failed to save announcement', 'error');
        return;
      }
    } else {
      const saved = await createAnnouncement(site, {
        title: editing.title.trim(),
        body: editing.body ?? null,
        imageUrl: editing.imageUrl ?? null,
        isActive: editing.isActive ?? true,
        ctaLabel: editing.ctaLabel ?? null,
        ctaUrl: editing.ctaUrl ?? null,
        ctaMode: editing.ctaMode ?? 'none',
        accentColor: editing.accentColor ?? null,
        style: editing.style ?? 'card',
        startsAt: editing.startsAt ?? null,
        endsAt: editing.endsAt ?? null,
      });
      if (!saved) {
        showNotification('Failed to create announcement', 'error');
        return;
      }
    }
    setEditing(null);
    showNotification('Announcement saved', 'success');
    await refresh();
  };

  const patchIntro = (p: Partial<NonNullable<PortalContent['intro']>>) => {
    onChange({ ...draft, intro: { ...draft.intro, ...p } });
  };

  const patchLinks = (sidebarLinks: SidebarLink[]) => onChange({ ...draft, sidebarLinks });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Portal welcome copy"
        description="Optional subheading below “Welcome back” on the dashboard"
        accent="blue"
        defaultOpen
        onReset={() => onChange({ ...draft, intro: PORTAL_DEFAULTS.intro })}
      >
        <PlainField
          label="Heading override (optional)"
          value={draft.intro?.heading ?? ''}
          onChange={(heading) => patchIntro({ heading: heading || undefined })}
          placeholder="Leave blank to keep personalized greeting"
        />
        <RichField
          label="Subheading (optional)"
          value={draft.intro?.subheadingHtml ?? ''}
          onChange={(subheadingHtml) => patchIntro({ subheadingHtml })}
        />
      </SectionCard>

      <section className="rounded-2xl bg-white shadow-[0_8px_30px_-18px_rgba(15,23,42,0.2)] ring-1 ring-slate-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <CmsPageHeader
            title="Announcements"
            description="Saves live immediately (not part of Publish/Discard). Welcome copy and Quick Access links below still need Publish."
            action={
              <CmsButton variant="primary" onClick={() => setEditing(emptyAnnouncement())}>
                <Plus className="h-4 w-4" />
                New
              </CmsButton>
            }
          />
        </div>

        <div className="p-5 space-y-3">
          {loadingList ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading announcements…</p>
          ) : announcements.length === 0 ? (
            <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
              <Megaphone className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">No announcements yet</p>
              <p className="text-sm text-slate-400 mt-1">Create one to show updates on the portal home.</p>
            </div>
          ) : (
            announcements.map((a) => (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-start gap-3 rounded-xl border border-slate-200/90 p-4 bg-white hover:shadow-md transition-shadow"
              >
                {a.imageUrl && (
                  <img src={a.imageUrl} alt="" className="h-20 w-28 shrink-0 object-cover rounded-lg ring-1 ring-black/5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-display font-bold text-slate-900 truncate">{a.title}</h4>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      a.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {a.isActive ? 'Active' : 'Hidden'}
                    </span>
                    {a.style === 'banner' && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#2260a1]/10 text-[#1a4880]">
                        Banner
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(a.publishedAt).toLocaleString()}
                    {a.ctaMode && a.ctaMode !== 'none' && ` · CTA: ${a.ctaLabel}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={a.isActive}
                      onChange={async (e) => {
                        await updateAnnouncement(a.id, { isActive: e.target.checked });
                        await refresh();
                      }}
                      className="rounded border-slate-300 text-[#2260a1] focus:ring-[#2260a1]/30"
                    />
                    Live
                  </label>
                  <CmsButton variant="ghost" className="!px-2" onClick={() => setEditing(a)}>
                    <Pencil className="h-4 w-4" />
                  </CmsButton>
                  <CmsButton
                    variant="ghost"
                    className="!px-2 text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      if (!confirm('Delete this announcement?')) return;
                      await deleteAnnouncement(a.id);
                      showNotification('Announcement deleted', 'success');
                      await refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </CmsButton>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {editing && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editing.id ? 'Edit announcement' : 'New announcement'}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 backdrop-blur px-5 py-4">
              <h4 className="font-display font-bold text-lg text-slate-900">
                {editing.id ? 'Edit announcement' : 'New announcement'}
              </h4>
              <CmsButton variant="ghost" onClick={() => setEditing(null)}>Close</CmsButton>
            </div>
            <div className="p-5 space-y-4">
              <PlainField label="Title" value={editing.title ?? ''} onChange={(title) => setEditing({ ...editing, title })} />
              <RichField label="Body" value={editing.body ?? ''} onChange={(body) => setEditing({ ...editing, body })} />
              <ImageUploadField label="Hero image" value={editing.imageUrl} onChange={(imageUrl) => setEditing({ ...editing, imageUrl })} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PlainField label="CTA label" value={editing.ctaLabel ?? ''} onChange={(ctaLabel) => setEditing({ ...editing, ctaLabel })} />
                <PlainField label="CTA URL" value={editing.ctaUrl ?? ''} onChange={(ctaUrl) => setEditing({ ...editing, ctaUrl })} />
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">CTA mode</span>
                  <CmsSelect
                    value={editing.ctaMode ?? 'none'}
                    onChange={(v) => setEditing({ ...editing, ctaMode: v as Announcement['ctaMode'] })}
                  >
                    <option value="none">None</option>
                    <option value="link">Open link</option>
                    <option value="iframe">Open in viewer</option>
                  </CmsSelect>
                </label>
              </div>

              <ColorField
                label="Accent color"
                value={editing.accentColor ?? '#ba0028'}
                onChange={(accentColor) => setEditing({ ...editing, accentColor })}
                presets={[
                  { label: 'GANSID red', value: '#ba0028' },
                  { label: 'GANSID blue', value: '#2260a1' },
                  { label: 'Emerald', value: '#059669' },
                ]}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Card style</span>
                  <CmsSelect
                    value={editing.style ?? 'card'}
                    onChange={(v) => setEditing({ ...editing, style: v as 'card' | 'banner' })}
                  >
                    <option value="card">Card</option>
                    <option value="banner">Banner (full-width header)</option>
                  </CmsSelect>
                </label>
                <CmsToggle
                  checked={editing.isActive ?? true}
                  onChange={(isActive) => setEditing({ ...editing, isActive })}
                  label="Visible on portal"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PlainField
                  label="Publish from (optional)"
                  type="datetime-local"
                  value={editing.startsAt ? editing.startsAt.slice(0, 16) : ''}
                  onChange={(v) => setEditing({ ...editing, startsAt: v ? new Date(v).toISOString() : null })}
                />
                <PlainField
                  label="Publish until (optional)"
                  type="datetime-local"
                  value={editing.endsAt ? editing.endsAt.slice(0, 16) : ''}
                  onChange={(v) => setEditing({ ...editing, endsAt: v ? new Date(v).toISOString() : null })}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <CmsButton variant="primary" onClick={saveAnnouncement}>Save announcement</CmsButton>
                <CmsButton variant="secondary" onClick={() => setEditing(null)}>Cancel</CmsButton>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <SectionCard
        title="Quick Access links"
        description="Sidebar on desktop + items in the mobile menu sheet"
        onReset={() => patchLinks(PORTAL_DEFAULTS.sidebarLinks)}
      >
        <RepeaterField<SidebarLink>
          label="Links"
          items={draft.sidebarLinks}
          onChange={patchLinks}
          newItem={() => ({
            id: crypto.randomUUID(),
            label: 'New link',
            mode: 'link',
            href: 'https://',
          })}
          renderItem={(link, patch) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PlainField label="Label" value={link.label} onChange={(label) => patch({ label })} />
              <PlainField label="Description" value={link.description ?? ''} onChange={(description) => patch({ description })} />
              <PlainField label="Icon (emoji)" value={link.icon ?? ''} onChange={(icon) => patch({ icon })} placeholder="📅" />
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Behaviour</span>
                <CmsSelect value={link.mode} onChange={(v) => patch({ mode: v as SidebarLink['mode'] })}>
                  <option value="link">External link (new tab)</option>
                  <option value="iframe">Embedded viewer</option>
                  <option value="soon">Coming soon</option>
                </CmsSelect>
              </label>
              {link.mode !== 'soon' && (
                <div className="sm:col-span-2">
                  <PlainField label="URL" value={link.href ?? ''} onChange={(href) => patch({ href })} />
                </div>
              )}
            </div>
          )}
        />
      </SectionCard>
    </div>
  );
}
