interface SecurityPanelProps {
  profile: string;
  injectionDetection: boolean;
  piiMasking: boolean;
  outputValidation: boolean;
  requireApproval?: string;
  onProfileChange: (profile: string) => void;
}

export function SecurityPanel(props: SecurityPanelProps) {
  const { profile, injectionDetection, piiMasking, outputValidation, requireApproval, onProfileChange } = props;

  return (
    <div className="security-panel rail-card">
      <h3>Security</h3>
      <div className="security-panel__profile">
        <label htmlFor="security-profile-select">Profile:</label>
        <select
          id="security-profile-select"
          value={profile}
          onChange={(e) => onProfileChange(e.target.value)}
          className="field-control"
        >
          <option value="strict">strict</option>
          <option value="standard">standard</option>
          <option value="permissive">permissive</option>
        </select>
      </div>
      <ul className="security-panel__features">
        <li>Injection Detection: {injectionDetection ? '[on]' : '[off]'}</li>
        <li>PII Masking: {piiMasking ? '[on]' : '[off]'}</li>
        <li>Output Validation: {outputValidation ? '[on]' : '[off]'}</li>
        {requireApproval !== undefined && (
          <li>Approval Required: {requireApproval}</li>
        )}
      </ul>
    </div>
  );
}
