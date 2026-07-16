# Approval anomaly detection

The governor tracks approval traffic so a malfunctioning worker or compromised prompt cannot hide behind repeated operator prompts. Each approval request is reduced to these evidence fields:

- `requestId`
- `workerId` from approval metadata, falling back to `taskId`
- `workdir` from approval metadata
- `commandClass` from approval metadata
- a normalized command fingerprint from metadata, `planDiff`, or the summary
- the request timestamp

## Rules

The default detector flags these patterns inside a five-minute window:

- high approval volume from one worker
- repeated destructive command approvals with the same command fingerprint
- approvals from many unique workdirs by one worker
- rapid retry loops for the same command fingerprint

These rules are intentionally narrow. Normal batches from different workers or workdirs stay below the defaults and are not blocked.

## Operator acknowledgement

When an approval request is flagged, the approval prompt is decorated with a `SECURITY NOTICE` and an acknowledgement token such as:

```text
ACK-APPROVAL-ANOMALY-req-123
```

An anomalous request that receives a normal `APPROVE` is converted to `ABORT` and audited as `securityFailure: "approval-anomaly"`. To proceed anyway, the operator must include the exact acknowledgement token in trusted response feedback (for example `a ACK-APPROVAL-ANOMALY-req-123` in the CLI channel, or an authenticated Slack action id carrying the same token). Caller-supplied request metadata is intentionally not accepted as acknowledgement material because guarded workers can populate their own request metadata.

## Metadata callers should provide

Approval callers should populate metadata when available:

```json
{
  "workerId": "t_1234",
  "workdir": "/home/pfkagent/dev/resolve-wt/issue-1234",
  "commandClass": "git-remote-write",
  "command": "git push --force-with-lease origin HEAD:resolve/issue-1234",
  "destructive": true,
  "force": true
}
```

The detector still works with partial metadata, but complete metadata gives operators better evidence and reduces false positives.

## Configuration

`GovernorConfig.approvalAnomalyDetection` can tune thresholds or disable the detector for controlled tests. Production governor paths should leave the default enabled state in place.
