import { EventEmitter } from 'node:events';
import { SessionMapper } from '../core/session-mapper.js';
import type { CommsRuntimePort } from '../core/comms-runtime-port.js';
import type {
  ChannelInboundMessage,
  ChannelOutboundMessage,
  ChannelAdapter,
  ChannelType,
  DeliverySensitivity,
} from '../core/types.js';

export interface ChatGatewayOptions {
  /** Maximum number of session route metadata records kept for action callbacks. */
  routeMetadataMaxEntries?: number;
  /** Per-channel delivery policy. Sensitive outbound messages are denied unless explicitly allowed. */
  channelSensitivityPolicy?: Partial<Record<ChannelType, { allowSensitiveDelivery?: boolean }>>;
}

const DEFAULT_ROUTE_METADATA_MAX_ENTRIES = 10_000;
const WITHHELD_SENSITIVE_MESSAGE = '[frankenbeast] Sensitive response withheld for this delivery channel. Enable allowSensitiveDelivery only for trusted channels, or view the response in a local/operator-only surface.';

export class ChatGateway extends EventEmitter {
  private readonly adapters = new Map<ChannelType, ChannelAdapter>();
  private readonly sessionMapper = new SessionMapper();
  private readonly routeMetadataBySession = new Map<string, Record<string, unknown>>();
  private readonly runtime: CommsRuntimePort;
  private readonly routeMetadataMaxEntries: number;
  private readonly channelSensitivityPolicy: Partial<Record<ChannelType, { allowSensitiveDelivery?: boolean }>>;

  constructor(runtime: CommsRuntimePort, options: ChatGatewayOptions = {}) {
    super();
    this.runtime = runtime;
    this.routeMetadataMaxEntries = this.normalizeRouteMetadataLimit(options.routeMetadataMaxEntries);
    this.channelSensitivityPolicy = options.channelSensitivityPolicy ?? {};
  }

  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  async handleInbound(message: ChannelInboundMessage): Promise<void> {
    const sessionId = this.sessionMapper.mapToSessionId({
      channelType: message.channelType,
      externalUserId: message.externalUserId,
      externalChannelId: message.externalChannelId,
      externalThreadId: message.externalThreadId,
    });
    const routeMetadata = this.toRouteMetadata(message);
    this.rememberRouteMetadata(sessionId, routeMetadata);

    const result = await this.runtime.processInbound({
      sessionId,
      channelType: message.channelType,
      text: message.text,
      externalUserId: message.externalUserId,
      metadata: {
        ...routeMetadata,
      },
    });

    const outbound: ChannelOutboundMessage = { text: result.text, metadata: routeMetadata };
    if (result.status) outbound.status = result.status;
    if (result.sensitivity) outbound.sensitivity = result.sensitivity;
    if (result.actions) outbound.actions = result.actions;
    if (result.metadata) outbound.metadata = { ...routeMetadata, ...result.metadata };
    if (result.provider) outbound.provider = result.provider;
    if (result.phase) outbound.phase = result.phase;
    outbound.sensitivity = this.resolveDeliverySensitivity(outbound);
    this.relayToChannel(sessionId, message.channelType, outbound);
  }

  async handleAction(
    channelType: ChannelType,
    sessionId: string,
    actionId: string,
    routeMetadata?: Record<string, unknown>,
  ): Promise<void> {
    // Map action IDs to the appropriate slash command.
    // /approve approves the pending action; /reject denies it.
    const text =
      actionId === 'approve'
        ? '/approve'
        : '/reject';

    const cachedRouteMetadata = routeMetadata ?? this.getRememberedRouteMetadata(sessionId);

    const result = await this.runtime.processInbound({
      sessionId,
      channelType,
      text,
      externalUserId: 'system',
    });

    const outboundRouteMetadata = {
      ...this.pickRouteMetadata(result.metadata),
      ...(cachedRouteMetadata ?? {}),
    };
    if (Object.keys(outboundRouteMetadata).length > 0) {
      this.rememberRouteMetadata(sessionId, outboundRouteMetadata);
    }
    const outbound: ChannelOutboundMessage = {
      text: result.text,
      ...(
        Object.keys(outboundRouteMetadata).length > 0 || result.metadata
          ? { metadata: { ...(result.metadata ?? {}), ...outboundRouteMetadata } }
          : {}
      ),
    };
    if (result.status) outbound.status = result.status;
    if (result.sensitivity) outbound.sensitivity = result.sensitivity;
    if (result.actions) outbound.actions = result.actions;
    if (result.provider) outbound.provider = result.provider;
    if (result.phase) outbound.phase = result.phase;
    outbound.sensitivity = this.resolveDeliverySensitivity(outbound);
    this.relayToChannel(sessionId, channelType, outbound);
  }

  private toRouteMetadata(message: ChannelInboundMessage): Record<string, unknown> {
    return {
      externalChannelId: message.externalChannelId,
      externalThreadId: message.externalThreadId,
      ...(message.channelType === 'slack' ? {
        channelId: message.externalChannelId,
        threadTs: message.externalThreadId,
      } : {}),
      ...(message.channelType === 'discord' ? {
        channelId: message.externalChannelId,
        threadId: message.externalThreadId,
      } : {}),
      ...(message.channelType === 'telegram' ? { chatId: message.externalChannelId } : {}),
      ...(message.channelType === 'whatsapp' ? { phoneNumber: message.externalChannelId } : {}),
    };
  }

  private pickRouteMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!metadata) return {};
    const routeMetadata: Record<string, unknown> = {};
    for (const key of [
      'externalChannelId',
      'externalThreadId',
      'channelId',
      'threadId',
      'threadTs',
      'chatId',
      'phoneNumber',
    ]) {
      if (metadata[key] !== undefined) routeMetadata[key] = metadata[key];
    }
    return routeMetadata;
  }

  private rememberRouteMetadata(sessionId: string, routeMetadata: Record<string, unknown>): void {
    // Refresh insertion order so the least-recently used session falls off first.
    this.routeMetadataBySession.delete(sessionId);
    this.routeMetadataBySession.set(sessionId, routeMetadata);

    while (this.routeMetadataBySession.size > this.routeMetadataMaxEntries) {
      const oldestSessionId = this.routeMetadataBySession.keys().next().value;
      if (typeof oldestSessionId !== 'string') break;
      this.routeMetadataBySession.delete(oldestSessionId);
    }
  }

  private getRememberedRouteMetadata(sessionId: string): Record<string, unknown> | undefined {
    const routeMetadata = this.routeMetadataBySession.get(sessionId);
    if (!routeMetadata) return undefined;
    this.rememberRouteMetadata(sessionId, routeMetadata);
    return routeMetadata;
  }

  private normalizeRouteMetadataLimit(routeMetadataMaxEntries: number | undefined): number {
    if (routeMetadataMaxEntries === undefined) return DEFAULT_ROUTE_METADATA_MAX_ENTRIES;
    if (!Number.isSafeInteger(routeMetadataMaxEntries) || routeMetadataMaxEntries < 1) {
      throw new Error('ChatGateway routeMetadataMaxEntries must be a positive safe integer');
    }
    return routeMetadataMaxEntries;
  }

  private relayToChannel(
    sessionId: string,
    channelType: ChannelType,
    outbound: ChannelOutboundMessage,
  ): void {
    const adapter = this.adapters.get(channelType);
    if (adapter) {
      adapter.send(sessionId, this.applyDeliverySensitivityPolicy(channelType, outbound)).catch((error: Error) => {
        this.emit(
          'error',
          new Error(
            `Failed to send to channel ${channelType}: ${error.message}`,
          ),
        );
      });
    }
  }

  private applyDeliverySensitivityPolicy(
    channelType: ChannelType,
    outbound: ChannelOutboundMessage,
  ): ChannelOutboundMessage {
    const sensitivity = this.resolveDeliverySensitivity(outbound);
    if (sensitivity !== 'sensitive') {
      return { ...outbound, sensitivity };
    }
    if (this.channelSensitivityPolicy[channelType]?.allowSensitiveDelivery === true) {
      return { ...outbound, sensitivity };
    }

    return {
      text: WITHHELD_SENSITIVE_MESSAGE,
      status: 'reply',
      sensitivity,
      metadata: {
        externalChannelId: outbound.metadata?.externalChannelId,
        externalThreadId: outbound.metadata?.externalThreadId,
        channelId: outbound.metadata?.channelId,
        threadId: outbound.metadata?.threadId,
        threadTs: outbound.metadata?.threadTs,
        chatId: outbound.metadata?.chatId,
        phoneNumber: outbound.metadata?.phoneNumber,
        deliveryDenied: true,
        deliveryDeniedReason: 'sensitive-channel-policy',
      },
    };
  }

  private resolveDeliverySensitivity(outbound: ChannelOutboundMessage): DeliverySensitivity {
    const signals = [
      this.normalizeSensitivityValue(outbound.sensitivity),
      this.normalizeSensitivityValue(outbound.metadata?.deliverySensitivity),
      this.normalizeSensitivityValue(outbound.metadata?.sensitivity),
    ];
    if (signals.includes('sensitive')) return 'sensitive';
    if (signals.includes('internal')) return 'internal';
    if (signals.includes('public')) return 'public';
    return 'internal';
  }

  private normalizeSensitivityValue(value: unknown): DeliverySensitivity | undefined {
    if (value === undefined) return undefined;
    if (value === 'public' || value === 'internal' || value === 'sensitive') return value;
    return 'sensitive';
  }

  close(): void {
    this.routeMetadataBySession.clear();
  }
}
