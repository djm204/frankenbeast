import type { ChatErrorBanner } from '../../hooks/use-chat-session';

export function ChatErrorBanners({
  banners = [],
  onDismiss = () => undefined,
  onRetry = () => undefined,
}: {
  banners?: ChatErrorBanner[];
  onDismiss?: (id: string) => void;
  onRetry?: (id: string) => void | Promise<unknown>;
}) {
  if (banners.length === 0) {
    return null;
  }

  return (
    <section className="chat-alerts" aria-label="Chat errors" aria-live="assertive">
      {banners.map((banner) => (
        <article key={banner.id} className="chat-alert" role="alert">
          <div className="chat-alert__body">
            <p className="eyebrow">{banner.code ?? 'chat_error'}</p>
            <h2>{banner.title}</h2>
            <p>{banner.message}</p>
          </div>
          <div className="chat-alert__actions">
            <button className="button button--secondary" type="button" onClick={() => onRetry(banner.id)}>
              {banner.actionLabel}
            </button>
            <button className="button button--ghost" type="button" onClick={() => onDismiss(banner.id)}>
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
