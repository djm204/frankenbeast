import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import type { TrackedAgentEvent } from '../../lib/beast-api';
import { buildLogDisplayEntries } from './log-display-entry';

interface LogViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: string[];
  events: TrackedAgentEvent[];
}

function getFullscreenErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error instanceof DOMException && error.message) {
    return error.message;
  }
  return 'The browser denied fullscreen mode.';
}

export function LogViewerModal({ isOpen, onClose, logs, events }: LogViewerModalProps) {
  const [search, setSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  const isFullscreenSupported =
    typeof document.documentElement.requestFullscreen === 'function' &&
    typeof document.exitFullscreen === 'function';

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const displayEntries = buildLogDisplayEntries(events, logs, search);

  async function handleFullscreen() {
    if (!isFullscreenSupported) {
      return;
    }

    setFullscreenError(null);

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(Boolean(document.fullscreenElement));
    } catch (error) {
      setFullscreenError(`Fullscreen request failed: ${getFullscreenErrorMessage(error)}`);
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[70]" />
        <Dialog.Content className="fixed top-[5vh] left-[5vw] w-[90vw] h-[90vh] bg-beast-panel border border-beast-border rounded-xl z-[70] flex flex-col">
          <div className="flex items-center gap-3 p-4 border-b border-beast-border">
            <Dialog.Title className="text-beast-text font-semibold flex-1">Events & Logs</Dialog.Title>
            <input
              type="text"
              placeholder="Search logs..."
              aria-label="Search logs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-beast-control border border-beast-border rounded-lg px-3 py-1.5 text-beast-text text-sm focus:outline-none focus:ring-2 focus:ring-beast-accent w-64"
            />
            <button
              type="button"
              onClick={handleFullscreen}
              disabled={!isFullscreenSupported}
              className="p-1.5 rounded-lg text-beast-subtle hover:text-beast-text hover:bg-beast-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-beast-subtle disabled:hover:bg-transparent"
              aria-label={
                isFullscreenSupported
                  ? isFullscreen
                    ? 'Exit fullscreen'
                    : 'Enter fullscreen'
                  : 'Fullscreen is not supported'
              }
              title={isFullscreenSupported ? undefined : 'Fullscreen is not supported in this browser'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            </button>
            <Dialog.Close asChild>
              <button type="button" className="p-1.5 rounded-lg text-beast-subtle hover:text-beast-text hover:bg-beast-elevated transition-colors" aria-label="Close">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>
          {fullscreenError ? (
            <div role="status" aria-live="polite" className="px-4 py-2 text-sm text-beast-danger border-b border-beast-border bg-beast-danger/10">
              {fullscreenError}
            </div>
          ) : null}
          <ScrollArea.Root className="flex-1 overflow-hidden">
            <ScrollArea.Viewport className="h-full w-full p-4">
              <div className="space-y-1 font-mono text-xs text-beast-muted">
                {displayEntries.map((entry) => (
                  <div key={entry.key} className={entry.level === 'error' ? 'text-beast-danger' : ''}>
                    {entry.label}
                  </div>
                ))}
                {displayEntries.length === 0 && (
                  <p className="text-beast-subtle italic">No matching entries</p>
                )}
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical" className="w-2 p-0.5">
              <ScrollArea.Thumb className="bg-beast-border rounded-full" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
