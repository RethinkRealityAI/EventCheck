import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type ReactNodeViewProps,
} from '@tiptap/react';
import { QrCode, Users, Trash2, GitBranch, MousePointerClick } from 'lucide-react';
import {
  CONDITION_FLAGS, EMAIL_STYLES, LINK_TARGETS, linkTargetFromHref, variableLabel, type ConditionFlag,
} from '../../../utils/emailTemplateDoc';

// Custom TipTap nodes for the ticket-email editor. Each one:
//   * renders a friendly, hard-to-break view while editing (a chip, a button,
//     a labelled box), and
//   * serialises (renderHTML) to the exact email-ready markup the server sends,
//     tagged so it parses back into the same node (see utils/emailTemplateDoc).
// Atoms (chips, button, QR, companions) delete as one unit, so a stray
// backspace can never leave half a {{placeholder}} or a broken tag behind.

/** Blocks allowed inside a "show only if" branch — anything but another condition. */
const BRANCH_CONTENT = '(paragraph | heading | bulletList | orderedList | blockquote | callout | ticketButton | qrCode | companionList)+';

const removeButton = (deleteNode: () => void, label: string) => (
  <button type="button" onClick={deleteNode} aria-label={label} title={label} contentEditable={false}
    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
    <Trash2 className="w-3.5 h-3.5" />
  </button>
);

// ── Variable chip ────────────────────────────────────────────────────────────
const VariableView: React.FC<ReactNodeViewProps> = ({ node, selected }) => (
  <NodeViewWrapper as="span" className={`inline-flex items-center align-baseline mx-0.5 px-1.5 rounded-md text-[0.85em] font-semibold leading-snug whitespace-nowrap border select-none ${
    selected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}
    title={`Filled in for each person: ${variableLabel(node.attrs.name)}`} data-drag-handle>
    {variableLabel(node.attrs.name)}
  </NodeViewWrapper>
);

export const Variable = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { name: { default: 'name', parseHTML: el => el.getAttribute('data-variable') } };
  },
  parseHTML() { return [{ tag: 'span[data-variable]' }]; },
  renderHTML({ node }) { return ['span', { 'data-variable': node.attrs.name }, `{{${node.attrs.name}}}`]; },
  renderText({ node }) { return `{{${node.attrs.name}}}`; },
  addNodeView() { return ReactNodeViewRenderer(VariableView); },
});

// ── Button ───────────────────────────────────────────────────────────────────
const ButtonView: React.FC<ReactNodeViewProps> = ({ node, selected, updateAttributes, deleteNode }) => {
  const target = linkTargetFromHref(node.attrs.href);
  const custom = !target;
  return (
    <NodeViewWrapper className={`my-4 rounded-lg border ${selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-transparent hover:border-slate-200'}`}>
      <div className="flex justify-center py-2" data-drag-handle>
        <span className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-[#1E4A8C] text-white text-sm font-semibold cursor-grab">
          <MousePointerClick className="w-4 h-4 opacity-70" /> {node.attrs.label || 'Button'}
        </span>
      </div>
      {selected && (
        <div contentEditable={false} className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 rounded-b-lg">
          <label className="flex-1 min-w-[140px] text-[11px] font-semibold text-slate-600">
            Button text
            <input value={node.attrs.label} onChange={e => updateAttributes({ label: e.target.value })}
              className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal" />
          </label>
          <label className="flex-1 min-w-[140px] text-[11px] font-semibold text-slate-600">
            Goes to
            <select value={custom ? '__custom' : target!}
              onChange={e => updateAttributes({ href: e.target.value === '__custom' ? 'https://' : `{{${e.target.value}}}` })}
              className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal bg-white">
              {LINK_TARGETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              <option value="__custom">A web address…</option>
            </select>
          </label>
          {custom && (
            <label className="w-full text-[11px] font-semibold text-slate-600">
              Web address
              <input value={node.attrs.href} onChange={e => updateAttributes({ href: e.target.value })} placeholder="https://"
                className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal" />
            </label>
          )}
          {removeButton(deleteNode, 'Remove button')}
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const TicketButton = Node.create({
  name: 'ticketButton',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      label: { default: 'Create my account' },
      href: { default: '{{account_url}}' },
    };
  },
  parseHTML() {
    return [{
      tag: 'p[data-block="button"]',
      // Above the paragraph rule, or a button parses back as a paragraph with a link.
      priority: 100,
      getAttrs: el => {
        const a = (el as HTMLElement).querySelector('a');
        return { label: (a?.textContent || (el as HTMLElement).textContent || '').trim(), href: a?.getAttribute('href') || '' };
      },
    }];
  },
  renderHTML({ node }) {
    return ['p', { 'data-block': 'button', style: EMAIL_STYLES.buttonWrap },
      ['a', { href: node.attrs.href, style: EMAIL_STYLES.button }, node.attrs.label || 'Open']];
  },
  addNodeView() { return ReactNodeViewRenderer(ButtonView); },
});

// ── QR code ──────────────────────────────────────────────────────────────────
const QrView: React.FC<ReactNodeViewProps> = ({ selected, deleteNode }) => (
  <NodeViewWrapper className={`my-4 flex items-center gap-3 rounded-lg border px-3 py-2.5 ${selected ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/40' : 'border-slate-200 bg-slate-50'}`} data-drag-handle>
    <QrCode className="w-8 h-8 text-slate-700 shrink-0" />
    <span className="flex-1 text-xs text-slate-600"><strong className="text-slate-800">Check-in QR code</strong><br />Each person's own code appears here.</span>
    {selected && removeButton(deleteNode, 'Remove QR code')}
  </NodeViewWrapper>
);

export const QrCodeBlock = Node.create({
  name: 'qrCode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  parseHTML() { return [{ tag: '[data-block="qr"]', priority: 100 }]; },
  renderHTML() {
    return ['div', { 'data-block': 'qr', style: EMAIL_STYLES.qrWrap },
      ['img', { src: '{{qr_image_url}}', alt: 'Check-in QR code', width: '200', height: '200', style: EMAIL_STYLES.qrImg }]];
  },
  addNodeView() { return ReactNodeViewRenderer(QrView); },
});

// ── Companions list ──────────────────────────────────────────────────────────
const CompanionsView: React.FC<ReactNodeViewProps> = ({ selected, deleteNode }) => (
  <NodeViewWrapper className={`my-4 flex items-center gap-3 rounded-lg border px-3 py-2.5 ${selected ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/40' : 'border-slate-200 bg-slate-50'}`} data-drag-handle>
    <Users className="w-6 h-6 text-slate-700 shrink-0" />
    <span className="flex-1 text-xs text-slate-600"><strong className="text-slate-800">People they booked for</strong><br />Each companion's name, ticket and account link, filled in automatically.</span>
    {selected && removeButton(deleteNode, 'Remove list')}
  </NodeViewWrapper>
);

export const CompanionList = Node.create({
  name: 'companionList',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-block="companions"]', priority: 100 }]; },
  renderHTML() { return ['div', { 'data-block': 'companions' }, '{{companions}}']; },
  addNodeView() { return ReactNodeViewRenderer(CompanionsView); },
});

// ── Shaded details box ───────────────────────────────────────────────────────
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML() { return [{ tag: 'div[data-block="callout"]', priority: 100 }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block': 'callout', style: EMAIL_STYLES.callout }), 0];
  },
});

// ── "Show only if…" sections ─────────────────────────────────────────────────
const flagMeta = (flag: string) => CONDITION_FLAGS.find(f => f.key === flag) ?? CONDITION_FLAGS[0];

const ConditionView: React.FC<ReactNodeViewProps> = ({ node, editor, getPos, deleteNode }) => {
  // The branches carry the flag too (for their labels), so change them together.
  const setFlag = (flag: ConditionFlag) => {
    editor.chain().command(({ tr }) => {
      const pos = getPos();
      if (typeof pos !== 'number') return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, flag });
      node.forEach((child, offset) => tr.setNodeMarkup(pos + 1 + offset, undefined, { ...child.attrs, flag }));
      return true;
    }).run();
  };
  return (
    <NodeViewWrapper className="my-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/30">
      <div contentEditable={false} className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-amber-200 bg-amber-50 rounded-t-xl" data-drag-handle>
        <GitBranch className="w-4 h-4 text-amber-700 shrink-0" />
        <span className="text-xs font-semibold text-amber-900">Different text depending on</span>
        <select value={node.attrs.flag} onChange={e => setFlag(e.target.value as ConditionFlag)} aria-label="Depends on"
          className="text-xs rounded border border-amber-300 bg-white px-1.5 py-1 min-w-0">
          {CONDITION_FLAGS.map(f => <option key={f.key} value={f.key}>{f.label.replace(/^Whether /, '').replace(/^\w/, c => c.toUpperCase())}</option>)}
        </select>
        <span className="ml-auto">{removeButton(deleteNode, 'Remove this section')}</span>
      </div>
      <NodeViewContent className="p-2 space-y-2" />
    </NodeViewWrapper>
  );
};

const BranchView: React.FC<ReactNodeViewProps> = ({ node }) => {
  const meta = flagMeta(node.attrs.flag);
  const yes = node.type.name === 'conditionThen';
  return (
    <NodeViewWrapper className={`rounded-lg border bg-white ${yes ? 'border-emerald-200' : 'border-slate-200'}`}>
      <div contentEditable={false} className={`px-2.5 py-1 text-[11px] font-semibold rounded-t-lg ${yes ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>
        {yes ? 'Shown when: ' : 'Otherwise (when: '}{yes ? meta.yes : `${meta.no})`}
      </div>
      <NodeViewContent className="px-3 py-1" />
    </NodeViewWrapper>
  );
};

const branch = (name: 'conditionThen' | 'conditionElse', kind: 'then' | 'else') => Node.create({
  name,
  content: BRANCH_CONTENT,
  defining: true,
  isolating: true,
  addAttributes() {
    return { flag: { default: 'has_account', parseHTML: el => el.parentElement?.getAttribute('data-cond') || 'has_account', renderHTML: () => ({}) } };
  },
  parseHTML() { return [{ tag: `div[data-branch="${kind}"]` }]; },
  renderHTML() { return ['div', { 'data-branch': kind }, 0]; },
  addNodeView() { return ReactNodeViewRenderer(BranchView); },
});

export const ConditionThen = branch('conditionThen', 'then');
export const ConditionElse = branch('conditionElse', 'else');

export const Condition = Node.create({
  name: 'condition',
  group: 'block',
  content: 'conditionThen conditionElse',
  draggable: true,
  isolating: true,
  addAttributes() {
    return { flag: { default: 'has_account', parseHTML: el => el.getAttribute('data-cond') || 'has_account', renderHTML: () => ({}) } };
  },
  parseHTML() { return [{ tag: 'div[data-cond]' }]; },
  renderHTML({ node }) { return ['div', { 'data-cond': node.attrs.flag }, 0]; },
  addNodeView() { return ReactNodeViewRenderer(ConditionView); },
});

export const ticketEmailNodes = [Variable, TicketButton, QrCodeBlock, CompanionList, Callout, Condition, ConditionThen, ConditionElse];
