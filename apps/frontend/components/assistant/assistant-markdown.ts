import type { AssistantDomain, AssistantRecordReference, AssistantToolResult } from '@/lib/assistant/contracts';
import { knownAssistantStatusLabel } from './assistant-labels';
import { safeRecordHref } from './assistant-helpers';

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Render known evidence values as business labels without modifying saved prose or link destinations. */
export function assistantMarkdownPlugin(references: AssistantRecordReference[], results: AssistantToolResult[]) {
  const candidates = new Map<string, Set<string>>();
  const add = (value: string, label: string | undefined) => {
    if (!label || value === label) return;
    const labels = candidates.get(value) ?? new Set<string>();
    labels.add(label);
    candidates.set(value, labels);
  };
  const addStatus = (value: unknown, domain?: AssistantDomain) => {
    if (typeof value === 'string') add(value, knownAssistantStatusLabel(value, domain));
  };

  for (const record of references) {
    // Short/numeric ERP keys can also be amounts or business document numbers in prose.
    // Only opaque internal identifiers are safe to replace without an explicit ID context.
    if (/^(?=.*[a-zA-Z])[a-zA-Z0-9_-]{16,}$/.test(record.id)) add(record.id, record.title);
    addStatus(record.status, record.domain);
  }
  for (const result of results) {
    const domains = new Set([...result.sources.map((source) => source.domain), ...result.records.map((record) => record.domain)]);
    const domain = domains.size === 1 ? [...domains][0] : undefined;
    for (const row of result.rows) {
      for (const key of ['estado', 'fase', 'faseActual']) addStatus(row[key], domain);
    }
  }
  const replacements = new Map(
    [...candidates].filter(([, labels]) => labels.size === 1).map(([value, labels]) => [value, [...labels][0]]),
  );
  const values = [...replacements.keys()].sort((a, b) => b.length - a.length);
  const tokens = values.length
    ? new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${values.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_-])`, 'gu')
    : null;
  const urls = /(?:https?:\/\/|\/(?:billing|suppliers|customers|finance|administracion)(?:\/|\?))[^\s<>]+/g;
  const normalizeText = (value: string) => {
    if (!tokens) return value;
    // Keep visible URLs intact too, including those inside ordinary text nodes.
    let output = '';
    let previous = 0;
    for (const match of value.matchAll(urls)) {
      output += value.slice(previous, match.index).replace(tokens, (token) => replacements.get(token)!);
      output += match[0];
      previous = match.index + match[0].length;
    }
    return output + value.slice(previous).replace(tokens, (token) => replacements.get(token)!);
  };

  return function evidenceLabels() {
    return function transform(tree: MarkdownNode) {
      const visit = (node: MarkdownNode, parent?: MarkdownNode) => {
        if (node.type === 'text' && typeof node.value === 'string') {
          if (!(parent?.type === 'link' && parent.url === node.value)) node.value = normalizeText(node.value);
        } else if (node.type === 'inlineCode' && typeof node.value === 'string') {
          const label = replacements.get(node.value);
          if (label) {
            node.type = 'text';
            node.value = label;
          }
        }
        for (const child of node.children ?? []) visit(child, node);
      };
      visit(tree);
    };
  };
}

/** Copy the rendered presentation, keeping only links already grounded in authorized evidence. */
export function assistantMarkdownClipboard(root: HTMLElement, allowedHrefs: ReadonlySet<string>): string {
  const visit = (node: Node): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';
    const element = node as HTMLElement;
    const tag = element.tagName;
    if (tag === 'BR') return '\n';
    if (tag === 'UL' || tag === 'OL') return `\n${[...element.children].map(visit).join('')}\n`;
    if (tag === 'TR') return `${[...element.children].map((cell) => visit(cell).trim()).join('\t')}\n`;
    const content = [...element.childNodes].map(visit).join('');
    if (tag === 'A') {
      const href = element.getAttribute('href');
      return href && allowedHrefs.has(href) && safeRecordHref(href) ? `${content} (${href})` : content;
    }
    if (tag === 'LI') {
      const siblings = element.parentElement ? [...element.parentElement.children] : [];
      const marker = element.parentElement?.tagName === 'OL' ? `${siblings.indexOf(element) + 1}.` : '•';
      return `${marker} ${content.trim()}\n`;
    }
    if (/^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|TABLE)$/.test(tag)) return `\n${content}\n`;
    return content;
  };
  return visit(root).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
