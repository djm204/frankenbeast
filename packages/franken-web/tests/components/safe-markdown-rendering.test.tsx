import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityPane } from '../../src/components/activity-pane';
import { LogViewerModal } from '../../src/components/beasts/log-viewer-modal';
import { TranscriptPane } from '../../src/components/transcript-pane';
import type { ActivityEvent } from '../../src/hooks/use-chat-session';

const ISSUE_BODY_PAYLOAD = 'Issue body **bold** <script>alert(1)</script> <img src=x onerror=alert(1)> [bad](javascript:alert(1))';
const PR_COMMENT_PAYLOAD = 'PR comment <iframe src="https://evil.example"></iframe> [data](data:text/html,<script>alert(1)</script>)';
const AGENT_LOG_PAYLOAD = '<svg onload=alert(1)>agent log</svg> javascript:alert(1)';
const MEMORY_EXCERPT_PAYLOAD = 'memory excerpt <a href="javascript:alert(1)" onclick="alert(1)">click me</a>';
const JSON_ESCAPED_MEMORY_EXCERPT_PAYLOAD = MEMORY_EXCERPT_PAYLOAD.replaceAll('"', '\\"');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function expectNoExecutableMarkup(container: HTMLElement) {
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('iframe')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('a[href^="javascript:" i]')).toBeNull();
  expect(container.querySelector('a[href^="data:" i]')).toBeNull();
  expect(container.querySelector('[onerror]')).toBeNull();
  expect(container.querySelector('[onclick]')).toBeNull();
  expect(container.querySelector('[onload]')).toBeNull();
}

describe('safe dashboard rendering for untrusted markdown and HTML', () => {
  it('renders issue body and PR comment markdown as escaped transcript text', () => {
    const { container } = render(
      <TranscriptPane
        messages={[
          { id: 'issue-body', role: 'user', content: ISSUE_BODY_PAYLOAD, timestamp: '2026-07-15T00:00:00.000Z' },
          { id: 'pr-comment', role: 'assistant', content: PR_COMMENT_PAYLOAD, timestamp: '2026-07-15T00:00:01.000Z' },
        ]}
        showTypingIndicator={false}
      />,
    );

    expect(container.textContent).toContain(ISSUE_BODY_PAYLOAD);
    expect(container.textContent).toContain(PR_COMMENT_PAYLOAD);
    expect(container.querySelectorAll('[data-safe-markdown-text="escaped-plain-text"]')).toHaveLength(2);
    expectNoExecutableMarkup(container);
  });

  it('renders PR comment summaries and memory excerpts as escaped activity text', () => {
    const events: ActivityEvent[] = [
      {
        type: 'turn.execution.progress',
        timestamp: '2026-07-15T00:00:00.000Z',
        data: {
          summary: PR_COMMENT_PAYLOAD,
          memoryExcerpt: MEMORY_EXCERPT_PAYLOAD,
        },
      },
    ];

    const { container } = render(<ActivityPane events={events} />);

    expect(container.textContent).toContain(PR_COMMENT_PAYLOAD);
    expect(container.textContent).toContain(JSON_ESCAPED_MEMORY_EXCERPT_PAYLOAD);
    expect(container.querySelectorAll('[data-safe-markdown-text="escaped-plain-text"]').length).toBeGreaterThanOrEqual(2);
    expectNoExecutableMarkup(container);
  });

  it('renders agent log payloads as escaped text in the log viewer', () => {
    render(
      <LogViewerModal
        isOpen={true}
        onClose={vi.fn()}
        events={[]}
        logs={[JSON.stringify({ stream: 'stderr', message: AGENT_LOG_PAYLOAD, createdAt: '2026-07-15T00:00:00.000Z' })]}
      />,
    );

    expect(document.body.textContent).toContain(AGENT_LOG_PAYLOAD);
    expect(document.body.querySelector('[data-safe-markdown-text="escaped-plain-text"]')).toBeTruthy();
    expectNoExecutableMarkup(document.body);
  });
});
