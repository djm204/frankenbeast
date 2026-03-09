export interface ApprovalCardProps {
  pending: boolean;
  description: string;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalCard({ pending, description, onApprove, onReject }: ApprovalCardProps) {
  if (!pending) return null;

  return (
    <section aria-label="Pending approval">
      <h3>Approval Required</h3>
      <p>{description}</p>
      <button onClick={onApprove}>Approve</button>
      <button onClick={onReject}>Reject</button>
    </section>
  );
}
