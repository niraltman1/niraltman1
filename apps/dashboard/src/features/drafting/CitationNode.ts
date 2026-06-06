import { Node, mergeAttributes } from '@tiptap/core';

export interface CitationNodeAttrs {
  entityType: 'case_law' | 'legislation' | 'regulation' | 'precedent' | 'internal';
  entityId:   number | null;
  citationRef: string;
  nodeId:     string;
}

export const CitationNode = Node.create<Record<string, never>>({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      entityType:  { default: 'case_law' },
      entityId:    { default: null },
      citationRef: { default: '' },
      nodeId:      { default: () => Math.random().toString(36).slice(2) },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-citation]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-citation': '',
        'data-ref':       HTMLAttributes['citationRef'] as string,
        style:            'display:inline-flex;align-items:center;gap:4px;padding:1px 6px;background:rgba(218,165,32,0.12);border:1px solid rgba(218,165,32,0.3);border-radius:4px;font-size:0.85em;color:#daa520;cursor:pointer;direction:rtl;',
      }),
      ['span', {}, '⚖ '],
      ['span', {}, (HTMLAttributes['citationRef'] as string) ?? ''],
    ];
  },
});
