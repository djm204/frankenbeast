import type { PendingApproval } from '../lib/api';

export interface ApprovalCardProps {
  pending: boolean;
  approval?: PendingApproval | null;
  description?: string;
  resolving?: boolean;
  error?: string | null;
  sessionId?: string | null;
  onApprove: () => void;
  onReject: () => void;
}

function formatRequestedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

interface DetailRowProps {
  label: string;
  children: string | string[] | undefined;
}

function DetailRow({ label, children }: DetailRowProps) {
  if (!children || (Array.isArray(children) && children.length === 0)) {
    return null;
  }

  return (
    <div className="approval-card__detail">
      <dt>{label}</dt>
      <dd>
        {Array.isArray(children) ? (
          <ul className="approval-card__file-list">
            {children.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : children}
      </dd>
    </div>
  );
}

export function ApprovalCard({
  pending,
  approval,
  description,
  resolving = false,
  error = null,
  sessionId,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  if (!pending) {
    return (
      <section className="rail-card" aria-label="Pending approval">
        <div className="rail-card__header">
          <p className="eyebrow">Approvals</p>
          <h2>Queue</h2>
        </div>
        <p className="rail-card__empty">No approval required.</p>
      </section>
    );
  }

  const approvalDescription = approval?.description ?? description ?? '';
  const effectiveSessionId = approval?.sessionId ?? sessionId ?? undefined;

  return (
    <section className="rail-card rail-card--approval" aria-label="Pending approval" aria-busy={resolving}>
      <div className="rail-card__header">
        <p className="eyebrow">Approvals</p>
        <h2>Approval Required</h2>
      </div>
      <p className="approval-card__description">{approvalDescription}</p>
      <dl className="approval-card__details" aria-label="Approval context">
        <DetailRow label="Tool" children={approval?.tool} />
        <DetailRow label="Command" children={approval?.command} />
        <DetailRow label="Risk" children={approval?.risk} />
        <DetailRow label="Requested" children={approval?.requestedAt ? formatRequestedAt(approval.requestedAt) : undefined} />
        <DetailRow label="Affected files" children={approval?.affectedFiles} />
        <DetailRow label="Session" children={effectiveSessionId} />
      </dl>
      {resolving ? (
        <p className="approval-card__status" role="status">
          Waiting for approval response…
        </p>
      ) : null}
      {error ? (
        <p className="approval-card__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="approval-card__actions">
        <button className="button button--primary" disabled={resolving} onClick={onApprove}>
          {resolving ? 'Submitting…' : 'Approve'}
        </button>
        <button className="button button--secondary" disabled={resolving} onClick={onReject}>Reject</button>
      </div>
    </section>
  );
}
