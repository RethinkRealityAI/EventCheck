import { useState, useEffect } from 'react';
import { CURRENT_SITE } from '../../config/sites';
import {
  listAnnouncements, createAnnouncement, updateAnnouncement,
  deleteAnnouncement, uploadAnnouncementImage,
} from '../../services/announcementService';
import type { Announcement } from '../../types';

export function AnnouncementsTab() {
  const site = CURRENT_SITE.key;
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { refresh(); }, []);
  const refresh = async () => setItems(await listAnnouncements(site));

  const save = async () => {
    if (!editing) return;
    if (!editing.id) {
      await createAnnouncement(site, {
        title: editing.title ?? 'Untitled',
        body: editing.body ?? null,
        imageUrl: editing.imageUrl ?? null,
        isActive: editing.isActive ?? true,
      });
    } else {
      await updateAnnouncement(editing.id, editing);
    }
    setEditing(null);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Announcements</h3>
        <button
          type="button"
          onClick={() => setEditing({ isActive: true })}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          + New
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="border rounded p-3 flex items-start gap-3">
            {a.imageUrl && <img src={a.imageUrl} alt="" className="h-16 w-16 object-cover rounded" />}
            <div className="flex-1">
              <div className="font-semibold">{a.title}</div>
              <div className="text-sm text-slate-500">{new Date(a.publishedAt).toLocaleString()}</div>
              {a.body && <p className="text-sm mt-1">{a.body.slice(0, 120)}{a.body.length > 120 ? '…' : ''}</p>}
            </div>
            <div className="flex flex-col gap-1 items-end">
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={a.isActive}
                  onChange={async (e) => { await updateAnnouncement(a.id, { isActive: e.target.checked }); await refresh(); }}
                />
                Active
              </label>
              <button type="button" onClick={() => setEditing(a)} className="text-sm text-blue-600">Edit</button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Delete this announcement?')) {
                    await deleteAnnouncement(a.id);
                    await refresh();
                  }
                }}
                className="text-sm text-red-600"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-500">No announcements yet.</p>}
      </ul>

      {editing && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="font-semibold">{editing.id ? 'Edit' : 'New'} Announcement</h4>
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Title"
            value={editing.title ?? ''}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
          <textarea
            className="w-full border rounded px-3 py-2"
            placeholder="Body (optional)"
            value={editing.body ?? ''}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            rows={4}
          />
          <div>
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
            {uploading && <span className="ml-2 text-sm">Uploading…</span>}
            {editing.imageUrl && <img src={editing.imageUrl} alt="" className="mt-2 h-32 rounded" />}
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editing.isActive ?? true}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border rounded">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
