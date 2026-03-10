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
  frankenbeast network help

DESCRIPTION
  Starts, stops, inspects, and configures the Frankenbeast local service network.
  Service selection is config-driven. Foreground mode supervises child processes
  directly. Detached mode persists operator state so later commands can manage
  the same services.

SECURITY MODES
  secure    Recommended. Uses operator-managed secret refs and stronger backends.
  insecure  Local-development convenience mode with redaction and no plaintext
            persistence in config, state, or logs controlled by Frankenbeast.

EXAMPLES
  frankenbeast network up
  frankenbeast network up -d
  frankenbeast network status
  frankenbeast network start chat-server
  frankenbeast network stop all
  frankenbeast network logs dashboard-web
  frankenbeast network config --set chat.model=claude-sonnet-4-6
`.trim();
}
