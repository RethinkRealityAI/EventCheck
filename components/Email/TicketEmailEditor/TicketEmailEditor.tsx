import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold, Italic, List, ListOrdered, Link2, Undo2, Redo2, Code2, QrCode, MousePointerClick, Users, SquareStack,
  GitBranch, GripVertical, Unlink, Heading2, Plus, ChevronUp,
} from 'lucide-react';
import { ticketEmailNodes } from './extensions';
import {
  CONDITION_FLAGS, LINK_TARGETS, TEMPLATE_VARIABLES, editorHtmlToTemplate, snippet, templateToEditorHtml,
} from '../../../utils/emailTemplateDoc';

/**
 * Visual editor for a ticket-email template.
 *
 * `value` / `onChange` speak the stored template format (HTML + {{tokens}} +
 * {{#if}} blocks) — the same string the server renders — so the composer and
 * the send path are unchanged. Everything a non-technical admin needs is on
 * the "Add to email" palette: click to insert at the cursor, or drag into
 * place. Personal details are chips, and buttons, the QR code and "show only
 * if…" sections are blocks; none can be half-deleted. "Edit HTML" remains for
 * anyone who wants the raw template.
 */

interface PaletteItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  html: string;
  insert: (e: Editor) => void;
}

const condHtml = (flag: string) => {
  const f = CONDITION_FLAGS.find(x => x.key === flag)!;
  return `<div data-cond="${flag}"><div data-branch="then"><p>Text for when ${f.yes.toLowerCase()}.</p></div><div data-branch="else"><p>Text for when ${f.no.toLowerCase()}.</p></div></div>`;
};

function buildPalette(): { title: string; hint: string; items: PaletteItem[] }[] {
  const html = (s: string) => (e: Editor) => { e.chain().focus().insertContent(s).run(); };
  return [
    {
      title: 'Personal details',
      hint: 'Filled in for each person',
      items: TEMPLATE_VARIABLES.map(v => ({
        id: `var-${v.key}`,
        label: v.label,
        html: snippet.variable(v.key),
        insert: (e: Editor) => { e.chain().focus().insertContent({ type: 'variable', attrs: { name: v.key } }).insertContent(' ').run(); },
      })),
    },
    {
      title: 'Ticket & buttons',
      hint: 'Personalised per person',
      items: [
        { id: 'qr', label: 'QR code', icon: <QrCode className="w-3.5 h-3.5" />, html: snippet.qr(), insert: html(snippet.qr()) },
        { id: 'btn-account', label: 'Create-account button', icon: <MousePointerClick className="w-3.5 h-3.5" />, html: snippet.button('Create my account', '{{account_url}}'), insert: html(snippet.button('Create my account', '{{account_url}}')) },
        { id: 'btn-signin', label: 'Sign-in button', icon: <MousePointerClick className="w-3.5 h-3.5" />, html: snippet.button('Sign in to my account', '{{portal_url}}'), insert: html(snippet.button('Sign in to my account', '{{portal_url}}')) },
        { id: 'btn-download', label: 'Download-ticket button', icon: <MousePointerClick className="w-3.5 h-3.5" />, html: snippet.button('Download my ticket', '{{ticket_download_url}}'), insert: html(snippet.button('Download my ticket', '{{ticket_download_url}}')) },
        { id: 'details', label: 'Details box', icon: <SquareStack className="w-3.5 h-3.5" />, html: snippet.callout('<p><strong>Registration details</strong></p>'), insert: html(snippet.callout('<p><strong>Registration details</strong></p>')) },
        { id: 'companions', label: 'People they booked for', icon: <Users className="w-3.5 h-3.5" />, html: snippet.companions(), insert: html(snippet.companions()) },
      ],
    },
    {
      title: 'Different text for different people',
      hint: 'each person sees the version that fits them',
      items: CONDITION_FLAGS.map(f => ({
        id: `cond-${f.key}`,
        label: f.short,
        icon: <GitBranch className="w-3.5 h-3.5" />,
        html: condHtml(f.key),
        insert: html(condHtml(f.key)),
      })),
    },
  ];
}

const PALETTE = buildPalette();

const ToolButton: React.FC<{ onClick: () => void; active?: boolean; disabled?: boolean; label: string; children: React.ReactNode }> = ({ onClick, active, disabled, label, children }) => (
  <button type="button" onMouseDown={e => e.preventDefault()} onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active}
    className={`p-1.5 rounded-md transition ${active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'} disabled:opacity-30`}>
    {children}
  </button>
);

function LinkMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const apply = (href: string, label: string) => {
    const { empty } = editor.state.selection;
    if (empty) {
      editor.chain().focus().insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] }).insertContent(' ').run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <ToolButton onClick={() => setOpen(o => !o)} active={editor.isActive('link') || open} label="Link">
        <Link2 className="w-4 h-4" />
      </ToolButton>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-1">
          <p className="px-2 pt-1.5 pb-1 text-[11px] text-slate-500">
            {editor.state.selection.empty ? 'Insert a link to…' : 'Link the selected text to…'}
          </p>
          {LINK_TARGETS.map(t => (
            <button key={t.key} type="button" onMouseDown={e => e.preventDefault()} onClick={() => apply(`{{${t.key}}}`, t.label)}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-slate-50">
              <span className="block text-xs font-semibold text-slate-800">{t.label}</span>
              <span className="block text-[11px] text-slate-500">{t.hint}</span>
            </button>
          ))}
          <button type="button" onMouseDown={e => e.preventDefault()}
            onClick={() => { const url = window.prompt('Web address (https://… or mailto:…)'); if (url) apply(url.trim(), url.trim()); }}
            className="w-full text-left rounded-md px-2 py-1.5 hover:bg-slate-50 text-xs font-semibold text-slate-800">
            A web address or email…
          </button>
          {editor.isActive('link') && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setOpen(false); }}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-red-50 text-xs font-semibold text-red-700 flex items-center gap-1.5">
              <Unlink className="w-3.5 h-3.5" /> Remove link
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TicketEmailEditor({ value, onChange }: { value: string; onChange: (template: string) => void }) {
  const [htmlMode, setHtmlMode] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const lastEmitted = useRef<string>(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: false, isAllowedUri: () => true },
      }),
      ...ticketEmailNodes,
    ],
    content: templateToEditorHtml(value),
    editorProps: {
      attributes: {
        class: 'min-h-[360px] px-4 py-3 text-sm leading-relaxed text-slate-800 focus:outline-none '
          + '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold '
          + '[&_a]:text-[#1E4A8C] [&_a]:underline [&_a]:font-semibold',
        'aria-label': 'Email body',
      },
    },
    onUpdate: ({ editor: e }) => {
      const t = editorHtmlToTemplate(e.getHTML());
      lastEmitted.current = t;
      onChange(t);
    },
  });

  // Outside changes (a preset, or the HTML view) reload the document; our own
  // edits echo back through `value` and are ignored to keep the cursor put.
  useEffect(() => {
    if (!editor || htmlMode || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(templateToEditorHtml(value), { emitUpdate: false });
  }, [editor, value, htmlMode]);

  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData('text/html', item.html);
    e.dataTransfer.setData('text/plain', item.label);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
      {/* Toolbar + palette stay pinned while a long email scrolls beneath them. */}
      <div className="sticky top-0 z-10 rounded-t-lg bg-white shadow-[0_1px_0_0_rgb(226,232,240)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-slate-200 bg-slate-50 px-2 py-1">
        {!htmlMode && editor && (
          <>
            <ToolButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></ToolButton>
            <ToolButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></ToolButton>
            <ToolButton label="Heading" active={editor.isActive('heading')} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></ToolButton>
            <ToolButton label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></ToolButton>
            <ToolButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></ToolButton>
            <LinkMenu editor={editor} />
            <span className="w-px h-5 bg-slate-200 mx-1" />
            <ToolButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="w-4 h-4" /></ToolButton>
            <ToolButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="w-4 h-4" /></ToolButton>
          </>
        )}
        {!htmlMode && (
          <button type="button" onClick={() => setShowPalette(v => !v)} aria-expanded={showPalette}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50">
            {showPalette ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showPalette ? 'Hide palette' : 'Add to email'}
          </button>
        )}
        <button type="button" onClick={() => setHtmlMode(m => !m)} aria-pressed={htmlMode}
          className={`${htmlMode ? 'ml-auto' : ''} inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${htmlMode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          title={htmlMode ? 'Back to the visual editor' : 'Edit the raw HTML template (advanced)'}>
          <Code2 className="w-3.5 h-3.5" /> {htmlMode ? 'Visual editor' : 'Edit HTML'}
        </button>
      </div>

      {!htmlMode && showPalette && (
          <div className="border-b border-slate-200 px-3 py-2 space-y-1.5">
            {PALETTE.map(group => (
              <div key={group.title} className="flex flex-wrap items-center gap-1.5">
                <span className="w-full text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {group.title} <span className="normal-case font-normal tracking-normal">— {group.hint}</span>
                </span>
                {group.items.map(item => (
                  // No preventDefault on mousedown here: in Chrome it also cancels the
                  // drag. The editor keeps its selection while blurred, and
                  // insert() refocuses it at the same place.
                  <button key={item.id} type="button" draggable onDragStart={e => onDragStart(e, item)}
                    onClick={() => editor && item.insert(editor)}
                    title="Click to insert at the cursor, or drag into place"
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold cursor-grab active:cursor-grabbing ${
                      item.id.startsWith('var-') ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        : item.id.startsWith('cond-') ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                    {item.icon ?? <GripVertical className="w-3 h-3 opacity-40" />}{item.label}
                  </button>
                ))}
              </div>
            ))}
            <p className="text-[10px] text-slate-400">Click to insert at the cursor, or drag into place.</p>
          </div>
        )}
      </div>

      {htmlMode ? (
        <div>
          <p className="px-3 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100">
            Advanced: changes here are kept, but a missing tag or brace can break the email. The preview shows the result.
          </p>
          <textarea value={value} onChange={e => onChange(e.target.value)} spellCheck={false} aria-label="Email body HTML"
            className="block w-full h-96 resize-y px-3 py-2 font-mono text-xs leading-relaxed outline-none" />
        </div>
      ) : (
        <>
          <EditorContent editor={editor} />
        </>
      )}
    </div>
  );
}
