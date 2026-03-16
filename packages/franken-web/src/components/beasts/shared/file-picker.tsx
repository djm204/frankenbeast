import type { ContextHealth } from '../../../lib/token-estimator';

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
}

const HEALTH_STYLES: Record<ContextHealth, { badge: string; label: string }> = {
  good: { badge: 'bg-green-500/20 text-green-400', label: 'Good' },
  warning: { badge: 'bg-yellow-500/20 text-yellow-400', label: 'Large' },
  critical: { badge: 'bg-red-500/20 text-red-400', label: 'Critical' },
};

export function FilePicker({ files, onFilesChange: _onFilesChange, onRemoveFile }: FilePickerProps) {
  return (
    <div className="space-y-3">
      <input
        type="file"
        multiple
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
