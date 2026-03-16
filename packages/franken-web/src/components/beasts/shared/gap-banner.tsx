interface GapBannerProps {
  message: string;
}

export function GapBanner({ message }: GapBannerProps) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-beast-accent/20 bg-beast-accent/5 text-sm text-beast-muted">
      <svg className="w-4 h-4 shrink-0 text-beast-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
