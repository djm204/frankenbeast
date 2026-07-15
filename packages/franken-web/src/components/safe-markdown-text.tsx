export const SAFE_MARKDOWN_TEXT_RULES = [
  'Untrusted dashboard markdown and HTML are rendered as escaped text, not parsed HTML.',
  'Line breaks and indentation are preserved by the existing surface styles.',
  'Links, images, iframes, inline event handlers, javascript: URLs, and data: URLs are never materialized from untrusted text.',
] as const;

export interface SafeMarkdownTextProps {
  text: string;
  className?: string;
}

export function SafeMarkdownText({ className, text }: SafeMarkdownTextProps) {
  return (
    <span className={className} data-safe-markdown-text="escaped-plain-text">
      {text}
    </span>
  );
}
