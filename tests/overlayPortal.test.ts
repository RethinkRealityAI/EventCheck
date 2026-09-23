import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

// Regression guard: every full-screen overlay must be portalled to <body>.
//
// `position: fixed` is only relative to the viewport while no ancestor
// establishes a containing block. `transform`, `filter` and `backdrop-filter`
// all do, and this app's glass cards use `backdrop-blur-*` everywhere. A
// `fixed inset-0` overlay rendered inside one of those cards is sized and
// clipped to the CARD, not the page. Incident: SponsorDetailModal, opened from
// the dashboard's Sponsors tab, rendered trapped inside the table card.
//
// The rule: any JSX element whose className carries both the `fixed` and
// `inset-0` classes must sit lexically inside either a <ModalPortal> element
// (components/ModalPortal.tsx) or a `createPortal(...)` /
// `ReactDOM.createPortal(...)` call.

const REPO_ROOT = join(__dirname, '..');

function* walkTsx(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkTsx(full);
    else if (entry.endsWith('.tsx')) yield full;
  }
}

/** Collects the literal text of every string part inside a className value. */
function classStrings(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      out.push(n.text);
      return;
    }
    if (ts.isTemplateExpression(n)) {
      // Join the literal parts with a non-whitespace placeholder so a token
      // that touches an interpolation (`${x}inset-0`, `inset-${n}`) is never
      // mistaken for a whole class token.
      out.push([n.head.text, ...n.templateSpans.map(s => s.literal.text)].join('\u0000'));
      n.templateSpans.forEach(s => visit(s.expression));
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** Utility name of a class token, without Tailwind variants or `!important`. */
function utility(token: string): string {
  return token.slice(token.lastIndexOf(':') + 1).replace(/^!|!$/g, '');
}

function isFullScreenFixed(classAttrValue: ts.Node): boolean {
  const tokens = new Set(
    classStrings(classAttrValue).flatMap(s => s.split(/\s+/)).map(utility),
  );
  return tokens.has('fixed') && tokens.has('inset-0');
}

function isPortalBoundary(node: ts.Node): boolean {
  if (ts.isJsxElement(node)) {
    return node.openingElement.tagName.getText() === 'ModalPortal';
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee)) return callee.text === 'createPortal';
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text === 'createPortal';
  }
  return false;
}

/** Returns `path:line` for every unportalled `fixed inset-0` element in `source`. */
function findUnportalledOverlays(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sf) === 'className' &&
      node.initializer &&
      isFullScreenFixed(node.initializer)
    ) {
      // attribute -> JsxAttributes -> opening/self-closing element
      const tag = node.parent.parent;
      const element = ts.isJsxOpeningElement(tag) ? tag.parent : tag;
      let ancestor: ts.Node | undefined = element.parent;
      while (ancestor && !isPortalBoundary(ancestor)) ancestor = ancestor.parent;
      if (!ancestor) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        violations.push(`${fileName}:${line}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return violations;
}

describe('full-screen overlays are portalled to <body>', () => {
  it('the checker flags an unwrapped overlay and accepts a portalled one', () => {
    const unwrapped = [
      `export function A({ open }: { open: boolean }) {`,
      `  return <div className="card backdrop-blur-md">`,
      `    {open && <div className="fixed inset-0 z-50 bg-black/50" />}`,
      `    <div className={\`fixed \${open ? 'inset-0' : 'hidden'}\`} />`,
      `    <div className="fixed -inset-0 inset-0.5 sm:inset-x-0" />`,
      `  </div>;`,
      `}`,
    ].join('\n');
    expect(findUnportalledOverlays('snippet.tsx', unwrapped)).toEqual(['snippet.tsx:3', 'snippet.tsx:4']);

    const wrapped = [
      `import ModalPortal from './ModalPortal';`,
      `import { createPortal } from 'react-dom';`,
      `export function B({ open }: { open: boolean }) {`,
      `  return <div className="card backdrop-blur-md">`,
      `    {open && <ModalPortal><div className="fixed inset-0 z-50"><p /></div></ModalPortal>}`,
      `    {open && createPortal(<div className="fixed inset-0" />, document.body)}`,
      `    {open && ReactDOM.createPortal(<div className="fixed inset-0" />, document.body)}`,
      `  </div>;`,
      `}`,
    ].join('\n');
    expect(findUnportalledOverlays('snippet.tsx', wrapped)).toEqual([]);
  });

  it('every `fixed inset-0` element in components/ and App.tsx is inside <ModalPortal> or createPortal', () => {
    const files = [...walkTsx(join(REPO_ROOT, 'components')), join(REPO_ROOT, 'App.tsx')];
    const violations = files.flatMap(file =>
      findUnportalledOverlays(relative(REPO_ROOT, file).replace(/\\/g, '/'), readFileSync(file, 'utf8')),
    );

    expect(
      violations,
      'Wrap each of these `fixed inset-0` overlays in <ModalPortal> (import ModalPortal from components/ModalPortal). ' +
        'A fixed overlay rendered inside an ancestor with transform, filter or backdrop-filter (every backdrop-blur-* ' +
        'glass card in this app) is sized and clipped to that ancestor instead of covering the page.',
    ).toEqual([]);
  });
});
