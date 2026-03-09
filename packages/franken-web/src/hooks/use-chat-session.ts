import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatApiClient } from '../lib/api';
import type { TranscriptMessage } from '../lib/api';

export type SessionStatus = 'idle' | 'loading' | 'streaming' | 'error';

export interface UseChatSessionOptions {
  baseUrl: string;
  projectId: string;
  sessionId?: string;
}

export interface UseChatSessionResult {
  transcript: TranscriptMessage[];
  status: SessionStatus;
  tier: string | null;
  sessionId: string | null;
  send: (content: string) => Promise<void>;
  approve: (approved: boolean) => Promise<void>;
}

export function useChatSession(opts: UseChatSessionOptions): UseChatSessionResult {
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [tier, setTier] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(opts.sessionId ?? null);

  const clientRef = useRef<ChatApiClient>(new ChatApiClient(opts.baseUrl));
  const eventSourceRef = useRef<EventSource | null>(null);

  // Create or resume session on mount
  useEffect(() => {
    const client = clientRef.current;
    let cancelled = false;

    async function init() {
      try {
        if (opts.sessionId) {
          // Resume existing session
          const session = await client.getSession(opts.sessionId);
          if (cancelled) return;
          setSessionId(session.id);
          setTranscript(session.transcript);
        } else {
          // Create new session
          const session = await client.createSession(opts.projectId);
          if (cancelled) return;
          setSessionId(session.id);
          setTranscript(session.transcript);
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [opts.projectId, opts.sessionId]);

  // Set up EventSource when sessionId is available
  useEffect(() => {
    if (!sessionId) return;

    const client = clientRef.current;
    const url = client.streamUrl(sessionId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        if (data.type === 'complete') {
          setStatus('idle');
        }
      } catch {
        // Ignore malformed events
      }
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [sessionId]);

  const send = useCallback(
    async (content: string) => {
      if (!sessionId) return;

      const userMsg: TranscriptMessage = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setTranscript((prev) => [...prev, userMsg]);
      setStatus('loading');

      try {
        const result = await clientRef.current.sendMessage(sessionId, content);
        setTier(result.tier);

        if (result.outcome.kind === 'reply') {
          const assistantMsg: TranscriptMessage = {
            role: 'assistant',
            content: result.outcome.content,
            timestamp: new Date().toISOString(),
            modelTier: result.outcome.modelTier,
          };
          setTranscript((prev) => [...prev, assistantMsg]);
        }

        setStatus('idle');
      } catch {
        setStatus('error');
      }
    },
    [sessionId],
  );

  const approve = useCallback(
    async (approved: boolean) => {
      if (!sessionId) return;
      await clientRef.current.approve(sessionId, approved);
    },
    [sessionId],
  );

  return { transcript, status, tier, sessionId, send, approve };
}
