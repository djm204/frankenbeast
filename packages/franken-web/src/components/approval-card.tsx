import { useEffect, useRef, useState } from 'react';
import type { ApprovalDecisionRequest, PendingApproval } from '../lib/api';

export interface ApprovalCardProps {
  pending: boolean;
  approval?: PendingApproval | null;
  description?: string;
  resolving?: boolean;
  error?: string | null;
  sessionId?: string | null;
  onApprove: (scope: ApprovalDecisionRequest) => void;
  onReject: (scope: ApprovalDecisionRequest) => void;
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
  const approvalDescription = approval?.description ?? description ?? '';
  const effectiveSessionId = approval?.sessionId ?? sessionId ?? undefined;
  const requestKey = approval?.approvalToken ?? JSON.stringify([
    effectiveSessionId ?? null,
    approval?.requestedAt ?? null,
    approval?.command ?? null,
  ]);
  const decisionScope: ApprovalDecisionRequest = {
    ...(effectiveSessionId ? { sessionId: effectiveSessionId } : {}),
    ...(approval?.requestedAt ? { requestedAt: approval.requestedAt } : {}),
    ...(approval?.command ? { command: approval.command } : {}),
    ...(approval?.approvalToken ? { approvalToken: approval.approvalToken } : {}),
  };
  const submittedRequestKeyRef = useRef<string | null>(null);
  const [submittedRequestKey, setSubmittedRequestKey] = useState<string | null>(null);
  const locallySubmitting = submittedRequestKey === requestKey;
  const isSubmitting = resolving || locallySubmitting;

  useEffect(() => {
    if (error && submittedRequestKeyRef.current === requestKey) {
      submittedRequestKeyRef.current = null;
      setSubmittedRequestKey(null);
    }
  }, [error, requestKey]);

  function submitDecision(callback: (scope: ApprovalDecisionRequest) => void) {
    if (resolving || submittedRequestKeyRef.current === requestKey) {
      return;
    }

    submittedRequestKeyRef.current = requestKey;
    setSubmittedRequestKey(requestKey);
    try {
      callback(decisionScope);
    } catch (error) {
      submittedRequestKeyRef.current = null;
      setSubmittedRequestKey(null);
      throw error;
    }
  }

  return (
    <section
      className={`rail-card${pending ? ' rail-card--approval' : ''}`}
      aria-label="Pending approval"
    >
      <div className="rail-card__header">
        <p className="eyebrow">Approvals</p>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <h2>{pending ? 'Approval Required' : 'Queue'}</h2>
        </div>
      </div>
      {!pending ? (
        <p className="rail-card__empty">No approval required.</p>
      ) : (
        <div aria-busy={isSubmitting}>
          <p className="approval-card__description">{approvalDescription}</p>
          <dl className="approval-card__details" aria-label="Approval context">
            <DetailRow label="Tool" children={approval?.tool} />
            <DetailRow label="Command" children={approval?.command} />
            <DetailRow label="Risk" children={approval?.risk} />
            <DetailRow label="Requested" children={approval?.requestedAt ? formatRequestedAt(approval.requestedAt) : undefined} />
            <DetailRow label="Affected files" children={approval?.affectedFiles} />
            <DetailRow label="Session" children={effectiveSessionId} />
          </dl>
          {isSubmitting ? (
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
            <button className="button button--primary" disabled={isSubmitting} onClick={() => submitDecision(onApprove)}>
              {isSubmitting ? 'Submitting…' : 'Approve'}
            </button>
            <button className="button button--secondary" disabled={isSubmitting} onClick={() => submitDecision(onReject)}>Reject</button>
          </div>
        </div>
      )}
    </section>
  );
}
