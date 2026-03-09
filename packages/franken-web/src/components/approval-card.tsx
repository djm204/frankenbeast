export interface ApprovalCardProps {
  pending: boolean;
  description: string;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalCard({ pending, description, onApprove, onReject }: ApprovalCardProps) {
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

  return (
    <section className="rail-card rail-card--approval" aria-label="Pending approval">
      <div className="rail-card__header">
        <p className="eyebrow">Approvals</p>
        <h2>Approval Required</h2>
      </div>
      <p className="approval-card__description">{description}</p>
      <div className="approval-card__actions">
        <button onClick={onApprove}>Approve</button>
        <button className="button-secondary" onClick={onReject}>Reject</button>
      </div>
    </section>
  );
}
