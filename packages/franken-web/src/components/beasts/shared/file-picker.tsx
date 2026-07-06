import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { estimateTokens, getContextHealth, type ContextHealth } from '../../../lib/token-estimator';

export interface PickedFile {
  name: string;
  content: string;
  tokens: number;
  health: ContextHealth;
}

interface FilePickerProps {
  files: PickedFile[];
  onFilesChange: (files: PickedFile[]) => void;
  onRemoveFile: (index: number) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const HEALTH_STYLES: Record<ContextHealth, { badge: string; label: string }> = {
  good: { badge: 'bg-green-500/20 text-green-400', label: 'Good' },
  warning: { badge: 'bg-yellow-500/20 text-yellow-400', label: 'Large' },
  critical: { badge: 'bg-red-500/20 text-red-400', label: 'Critical' },
};

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export function FilePicker({ files, onFilesChange, onRemoveFile, onLoadingChange }: FilePickerProps) {
  const filesRef = useRef(files);
  const isMountedRef = useRef(true);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
  }, [onLoadingChange]);

  useEffect(() => () => {
    isMountedRef.current = false;
    onLoadingChangeRef.current?.(false);
  }, []);

  function setReadingState(loading: boolean) {
    if (!isMountedRef.current) return;
    setIsReading(loading);
    onLoadingChangeRef.current?.(loading);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;

    setReadError(null);
    setReadingState(true);
    const results = await Promise.allSettled(
      selectedFiles.map(async (file) => {
        const content = await readFileText(file);
        const tokens = estimateTokens(content);
        return {
          name: file.name,
          content,
          tokens,
          health: getContextHealth(tokens),
        } satisfies PickedFile;
      }),
    );

    if (!isMountedRef.current) return;
    const pickedFiles = results
      .filter((result): result is PromiseFulfilledResult<PickedFile> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failedCount = results.length - pickedFiles.length;

    if (pickedFiles.length > 0) {
      onFilesChange([...filesRef.current, ...pickedFiles]);
    }
    if (failedCount > 0) {
      setReadError(`${failedCount} file${failedCount === 1 ? '' : 's'} could not be read and were skipped.`);
    }
    event.target.value = '';
    setReadingState(false);
  }

  return (
    <div className="space-y-3">
      {readError && <p className="text-xs text-beast-danger" role="alert">{readError}</p>}
      {isReading && <p className="text-xs text-beast-subtle" role="status">Reading selected files…</p>}
      <input
        type="file"
        multiple
        aria-label="Attach files"
        onChange={handleFileChange}
        className="block w-full text-sm text-beast-text file:mr-4 file:py-2 file:px-4
          file:rounded-lg file:border file:border-beast-border file:text-sm
          file:bg-beast-control file:text-beast-text hover:file:bg-beast-elevated"
      />
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => {
            const health = HEALTH_STYLES[file.health];
            return (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-beast-control border border-beast-border">
                <span className="text-sm text-beast-text truncate flex-1">{file.name}</span>
                <span className="text-xs text-beast-subtle">{file.tokens} tokens</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${health.badge}`}>{health.label}</span>
                {file.health === 'critical' && (
                  <span className="text-xs text-beast-danger">Too large — consider condensing</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  className="text-beast-subtle hover:text-beast-danger transition-colors"
                  aria-label={`Remove ${file.name}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
