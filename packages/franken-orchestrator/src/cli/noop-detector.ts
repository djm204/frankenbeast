const NOOP_KEYWORDS = [
  'code complete',
  'no changes required',
  'no changes needed',
  'fully implemented',
  'nothing to do',
  'no work needed',
  'no work required',
  'no implementation needed',
  'no implementation required',
  'already complete',
  'already implemented',
];

const WORK_SECTIONS = [
  /^## Implementation/m,
  /^## Tasks/m,
  /^## Changes/m,
  /^## Components to Build/m,
  /^## Steps/m,
];

const MIN_CONTENT_LENGTH = 200;

export function isNoOpDesign(markdown: string): boolean {
  const lower = markdown.toLowerCase();

  for (const pattern of WORK_SECTIONS) {
    if (pattern.test(markdown)) {
      return false;
    }
  }

  if (markdown.trim().length < MIN_CONTENT_LENGTH) {
    return true;
  }

  return NOOP_KEYWORDS.some((keyword) => lower.includes(keyword));
}
