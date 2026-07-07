// Server-side sanitizer for the constrained rich-text field (superadmin plan
// 04 §5: "the HTML field is sanitized on the backend on write"). Whitelist
// mirrors the editor CVA (`superadmin .../cms/components/rich-text`): tag names
// only, every attribute dropped. No DOM on Workers, so this is a token pass:
// allowed tags are swapped for NUL-delimited markers (NULs are stripped from
// the input first, so markers can't be forged), everything else is stripped
// (its text survives), leftover angle brackets are entity-escaped, then the
// kept tags are restored. When an attribute value smuggles a `>` the tag is
// cut short and the tail escapes as text — ugly output, but never markup.
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'ul', 'li', 'p', 'br', 'div']);

const TAG_TOKEN = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\/?\s*>/g;

const NUL = '\u0000';
const RESTORE_TOKEN = /\u0000(\d+)\u0000/g;

export const sanitizeHtml = (input: string): string => {
  const kept: string[] = [];
  const marked = input
    .replaceAll(NUL, '')
    .replace(TAG_TOKEN, (_match, slash: string, rawTag: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      kept.push(slash ? `</${tag}>` : `<${tag}>`);
      return `${NUL}${kept.length - 1}${NUL}`;
    });
  return marked
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(RESTORE_TOKEN, (_match, index: string) => kept[Number(index)] ?? '');
};
