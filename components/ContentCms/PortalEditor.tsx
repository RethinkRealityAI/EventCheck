import React, { useEffect, useState } from 'react';
import { CURRENT_SITE } from '../../config/sites';
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  uploadAnnouncementImage,
} from '../../services/announcementService';
import type { Announcement, PortalContent, SidebarLink } from '../../types';
import { PORTAL_DEFAULTS } from '../Portal/content/landingDefaults';
import { PlainField } from './fields/PlainField';
import { RichField } from './fields/RichField';
import { ColorField } from './fields/ColorField';
import { RepeaterField } from './fields/RepeaterField';

export function PortalEditor({
  draft,
  onChange,
}: {
  draft: PortalContent;
  onChange: (d: PortalContent) => void;
}) {
  const site = CURRENT_SITE.key;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = async () => setAnnouncements(await listAnnouncements(site));
  useEffect(() => { refresh(); }, [site]);

  const saveAnnouncement = async () => {
    if (!editing?.title?.trim()) return;
    if (!editing.id) {
      await createAnnouncement(site, {
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
    } else {
      await updateAnnouncement(editing.id, editing);
    }
    setEditing(null);
    await refresh();
  };

  const patchLinks = (sidebarLinks: SidebarLink[]) => onChange({ ...draft, sidebarLinks });

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Announcements</h3>
            <p className="text-sm text-slate-500">Shown on the portal dashboard feed.</p>
          </div>
          <button
            type="button"
            onClick={() => setEditing({ isActive: true, ctaMode: 'none', style: 'card' })}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold"
          >
            + New
          </button>
        </div>

        <ul className="space-y-2">
          {announcements.map((a) => (
            <li key={a.id} className="border border-slate-200 rounded-xl p-3 flex items-start gap-3 bg-white">
              {a.imageUrl && <img src={a.imageUrl} alt="" className="h-16 w-16 object-cover rounded-lg" />}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 truncate">{a.title}</div>
                <div className="text-xs text-slate-500">{new Date(a.publishedAt).toLocaleString()}</div>
                {a.ctaMode && a.ctaMode !== 'none' && (
                  <div className="text-xs text-indigo-600 mt-1">CTA: {a.ctaMode} — {a.ctaLabel}</div>
                )}
              </div>
              <div className="flex flex-col gap-1 items-end shrink-0">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={a.isActive}
                    onChange={async (e) => { await updateAnnouncement(a.id, { isActive: e.target.checked }); await refresh(); }}
                  />
                  Active
                </label>
                <button type="button" onClick={() => setEditing(a)} className="text-xs text-indigo-600">Edit</button>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm('Delete this announcement?')) {
                      await deleteAnnouncement(a.id);
                      await refresh();
                    }
                  }}
                  className="text-xs text-red-600"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {announcements.length === 0 && <p className="text-sm text-slate-500">No announcements yet.</p>}
        </ul>

        {editing && (
          <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50">
            <h4 className="font-semibold">{editing.id ? 'Edit' : 'New'} announcement</h4>
            <PlainField label="Title" value={editing.title ?? ''} onChange={(title) => setEditing({ ...editing, title })} />
            <RichField label="Body" value={editing.body ?? ''} onChange={(body) => setEditing({ ...editing, body })} />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const url = await uploadAnnouncementImage(file);
                  setUploading(false);
                  if (url) setEditing({ ...editing, imageUrl: url });
                }}
              />
              {uploading && <span className="ml-2 text-sm text-slate-500">Uploading…</span>}
              {editing.imageUrl && <img src={editing.imageUrl} alt="" className="mt-2 h-32 rounded-lg" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PlainField label="CTA label" value={editing.ctaLabel ?? ''} onChange={(ctaLabel) => setEditing({ ...editing, ctaLabel })} />
              <PlainField label="CTA URL" value={editing.ctaUrl ?? ''} onChange={(ctaUrl) => setEditing({ ...editing, ctaUrl })} />
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">CTA mode</span>
                <select
                  value={editing.ctaMode ?? 'none'}
                  onChange={(e) => setEditing({ ...editing, ctaMode: e.target.value as Announcement['ctaMode'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="none">None</option>
                  <option value="link">Link</option>
                  <option value="iframe">Iframe</option>
                </select>
              </label>
            </div>
            <ColorField
              label="Accent color"
              value={editing.accentColor ?? '#ba0028'}
              onChange={(accentColor) => setEditing({ ...editing, accentColor })}
              presets={[
                { label: 'GANSID red', value: '#ba0028' },
                { label: 'GANSID blue', value: '#2260a1' },
              ]}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Style</span>
                <select
                  value={editing.style ?? 'card'}
                  onChange={(e) => setEditing({ ...editing, style: e.target.value as 'card' | 'banner' })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="card">Card</option>
                  <option value="banner">Banner</option>
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  checked={editing.isActive ?? true}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PlainField
                label="Starts at (ISO, optional)"
                value={editing.startsAt ?? ''}
                onChange={(startsAt) => setEditing({ ...editing, startsAt: startsAt || null })}
              />
              <PlainField
                label="Ends at (ISO, optional)"
                value={editing.endsAt ?? ''}
                onChange={(endsAt) => setEditing({ ...editing, endsAt: endsAt || null })}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={saveAnnouncement} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">Save</button>
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Sidebar / Quick Access links</h3>
            <p className="text-sm text-slate-500">Portal quick nav + mobile menu links.</p>
          </div>
          <button
            type="button"
            onClick={() => patchLinks(PORTAL_DEFAULTS.sidebarLinks)}
            className="text-sm text-slate-500 hover:text-indigo-600 underline"
          >
            Reset links to default
          </button>
        </div>

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
              <PlainField label="Icon (emoji)" value={link.icon ?? ''} onChange={(icon) => patch({ icon })} />
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Mode</span>
                <select
                  value={link.mode}
                  onChange={(e) => patch({ mode: e.target.value as SidebarLink['mode'] })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="link">External link</option>
                  <option value="iframe">Iframe modal</option>
                  <option value="soon">Coming soon</option>
                </select>
              </label>
              {link.mode !== 'soon' && (
                <div className="sm:col-span-2">
                  <PlainField label="URL" value={link.href ?? ''} onChange={(href) => patch({ href })} />
                </div>
              )}
            </div>
          )}
        />
      </section>
    </div>
  );
}
