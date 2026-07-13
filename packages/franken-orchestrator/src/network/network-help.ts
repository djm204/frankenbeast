export function renderNetworkHelp(): string {
  return `
NAME
  frankenbeast network - manage Frankenbeast request-serving services

SYNOPSIS
  frankenbeast network up [-d]
  frankenbeast network down
  frankenbeast network status
  frankenbeast network start <service|all>
  frankenbeast network stop <service|all>
  frankenbeast network restart <service|all>
  frankenbeast network logs <service|all>
  frankenbeast network config [--set path=value]
  frankenbeast network credentials
  frankenbeast network help

DESCRIPTION
  Starts, stops, inspects, and configures the Frankenbeast local service network.
  Service selection is config-driven. Foreground mode supervises child processes
  directly. Detached mode persists operator state so later commands can manage
  the same services.

MANAGED CHILDREN
  frankenbeast network sets FRANKENBEAST_NETWORK_MANAGED=1 for managed child
  services. Treat it as a supervisor-owned marker, not a normal user toggle.
  Managed children suppress the CLI banner, and managed chat-server fails closed
  without an operator token even on loopback. Unset the marker for standalone
  chat-server debugging, or provide FRANKENBEAST_BEAST_OPERATOR_TOKEN when
  intentionally running with managed semantics.

SECURITY MODES
  secure    Recommended. Uses operator-managed secret refs and stronger backends.
  insecure  Local-development convenience mode with redaction and no plaintext
            persistence in config, state, or logs controlled by Frankenbeast.

CREDENTIAL INVENTORY
  frankenbeast network credentials prints structured JSON for every scoped
  credential reference used by the managed network. The report includes only
  config reference names and status values; it never resolves or prints secret
  values. Treat missing entries as explicit setup gaps before exposing services.

EXAMPLES
  frankenbeast network up
  frankenbeast network up -d
  frankenbeast network status
  frankenbeast network start chat-server
  frankenbeast network stop all
  frankenbeast network logs dashboard-web
  frankenbeast network config --set chat.model=claude-sonnet-4-6
  frankenbeast network credentials
`.trim();
}
