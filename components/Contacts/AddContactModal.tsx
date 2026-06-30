import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { X, UserPlus, Loader2 } from 'lucide-react';
import {
  createImportedContact,
  addTagsToContacts,
  type ImportedContact,
} from '../../services/importedContactsService';
import { isValidEmail } from '../../utils/formValidation';
import { useNotifications } from '../NotificationSystem';

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  /** Full contact list — used for the case-insensitive duplicate-email guard. */
  existingContacts: ImportedContact[];
  /** Called after a successful create / merge so the tab reloads. */
  onCreated: () => void;
}

const AddContactModal: React.FC<AddContactModalProps> = ({ open, onClose, existingContacts, onCreated }) => {
  const { showNotification } = useNotifications();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dupId, setDupId] = useState<string | null>(null);

  if (!open) return null;

  const parseTags = () => tagsInput.split(',').map(t => t.trim()).filter(Boolean);
  const reset = () => { setName(''); setEmail(''); setTagsInput(''); setError(''); setDupId(null); };
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const n = name.trim();
    const em = email.trim();
    if (!n) { setError('Please enter a name.'); return; }
    if (!isValidEmail(em)) { setError('Please enter a valid email address.'); return; }
    const dup = existingContacts.find(c => (c.email || '').trim().toLowerCase() === em.toLowerCase());
    if (dup) { setDupId(dup.id); return; }
    setSaving(true);
    try {
      await createImportedContact({ name: n, email: em, tags: parseTags() });
      showNotification(`${n} added to contacts`, 'success');
      onCreated();
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to add contact.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTagsToExisting = async () => {
    if (!dupId) return;
    const tags = parseTags();
    if (tags.length === 0) { handleClose(); return; }
    setSaving(true);
    try {
      await addTagsToContacts([dupId], tags);
      showNotification('Tags added to the existing contact', 'success');
      onCreated();
      handleClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update the existing contact.');
    } finally {
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm bg-black/20 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Add contact">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div className="flex items-center gap-2 text-white">
            <UserPlus className="w-5 h-5" />
            <h3 className="text-lg font-bold">Add contact</h3>
          </div>
          <button type="button" onClick={handleClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="ac-name" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Name</label>
            <input id="ac-name" autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Full name" />
          </div>
          <div>
            <label htmlFor="ac-email" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Email</label>
            <input id="ac-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setDupId(null); }} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="name@example.com" />
          </div>
          <div>
            <label htmlFor="ac-tags" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Tags <span className="text-gray-400 normal-case font-normal">(comma-separated, optional)</span></label>
            <input id="ac-tags" value={tagsInput} onChange={e => setTagsInput(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="VIP, Speaker" />
          </div>

          {dupId && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              A contact with this email is already in your list.{' '}
              <button type="button" onClick={handleAddTagsToExisting} className="underline font-semibold">Add these tags to it</button> instead?
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add contact
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default AddContactModal;
