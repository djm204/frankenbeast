import type { SqliteBrain } from '@franken/brain';
import { BrainRegistry } from '@franken/brain';
import type { EpisodicEvent } from '@franken/types';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { requireBeastOperatorAuth } from '../../beasts/http/beast-auth.js';
import {
  InMemoryRateLimiter,
  requireBeastRateLimit,
  type BeastRateLimitOptions,
} from '../../beasts/http/beast-rate-limit.js';
import { HttpError } from '../middleware.js';
import { TransportSecurityService } from '../security/transport-security.js';

const MAX_WORKING_MEMORY_KEYS = 100;
const DEFAULT_EPISODE_PAGE_LIMIT = 25;
const MAX_EPISODE_PAGE_LIMIT = 100;
const MAX_EPISODE_PAGE_OFFSET = 1_000;
const MAX_EPISODE_QUERY_LENGTH = 256;
const MAX_EPISODE_SUMMARY_BYTES = 4 * 1_024;
const MAX_EPISODE_DETAILS_BYTES = 8 * 1_024;
const MAX_EPISODE_STEP_BYTES = 1_024;
const MAX_EPISODE_TIMESTAMP_BYTES = 64;

const EpisodeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_EPISODE_PAGE_LIMIT).default(DEFAULT_EPISODE_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).max(MAX_EPISODE_PAGE_OFFSET).default(0),
  query: z.string().trim().min(1).max(MAX_EPISODE_QUERY_LENGTH).optional(),
}).strict();

export interface BrainRoutesDeps {
  registry: BrainRegistry;
  operatorToken: string;
  security: TransportSecurityService;
  rateLimit?: BeastRateLimitOptions;
}

function resolveBrain(c: Context, registry: BrainRegistry): { agentTypeId: string; brain: SqliteBrain } {
  const agentTypeId = c.req.param('agentTypeId') ?? '';
  let brain: SqliteBrain | undefined;
  try {
    brain = registry.getAgentType(agentTypeId);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new HttpError(400, 'INVALID_AGENT_TYPE_ID', 'agentTypeId is invalid');
    }
    throw error;
  }
  if (!brain) {
    throw new HttpError(404, 'BRAIN_NOT_FOUND', 'No brain exists for the requested agent type');
  }
  return { agentTypeId, brain };
}

function parseEpisodeQuery(c: Context): z.infer<typeof EpisodeQuerySchema> {
  const parsed = EpisodeQuerySchema.safeParse({
    ...(c.req.query('limit') === undefined ? {} : { limit: c.req.query('limit') }),
    ...(c.req.query('offset') === undefined ? {} : { offset: c.req.query('offset') }),
    ...(c.req.query('query') === undefined ? {} : { query: c.req.query('query') }),
  });
  if (!parsed.success) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Request validation failed', parsed.error.issues);
  }
  return parsed.data;
}

function readBrainState<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'BRAIN_READ_FAILED', 'Brain state could not be read');
  }
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoded = Buffer.from(value);
  if (encoded.byteLength <= maxBytes) return { value, truncated: false };
  return { value: encoded.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

function boundEpisode(event: EpisodicEvent) {
  const step = event.step === undefined
    ? undefined
    : truncateUtf8(event.step, MAX_EPISODE_STEP_BYTES);
  const summary = truncateUtf8(event.summary, MAX_EPISODE_SUMMARY_BYTES);
  const createdAt = truncateUtf8(event.createdAt, MAX_EPISODE_TIMESTAMP_BYTES);
  const detailsTooLarge = event.details !== undefined
    && Buffer.byteLength(JSON.stringify(event.details)) > MAX_EPISODE_DETAILS_BYTES;
  return {
    ...event,
    ...(step ? { step: step.value } : {}),
    summary: summary.value,
    createdAt: createdAt.value,
    ...(step?.truncated ? { stepTruncated: true as const } : {}),
    ...(summary.truncated ? { summaryTruncated: true as const } : {}),
    ...(createdAt.truncated ? { createdAtTruncated: true as const } : {}),
    ...(detailsTooLarge ? { details: null, detailsTruncated: true as const } : {}),
  };
}

export function brainRoutes(deps: BrainRoutesDeps): Hono {
  const app = new Hono();
  const auth = requireBeastOperatorAuth({
    operatorToken: deps.operatorToken,
    security: deps.security,
  });

  app.use('/v1/brain/*', auth);
  if (deps.rateLimit) {
    const limiter = new InMemoryRateLimiter(deps.rateLimit);
    app.use('/v1/brain/*', requireBeastRateLimit(
      limiter,
      (authHeader, path) => `${authHeader ?? 'anonymous'}:${path}`,
    ));
  }

  app.get('/v1/brain/:agentTypeId', (c) => readBrainState(() => {
    const { agentTypeId, brain } = resolveBrain(c, deps.registry);
    // Refresh persisted working memory view to avoid stale in-memory cache
    (brain as any).refreshPreparedStateForFlush?.();
    const allWorkingKeys = brain.working.keys().sort();
    const lastCheckpoint = brain.recovery.lastCheckpoint();

    return c.json({
      data: {
        agentTypeId,
        workingMemory: {
          keys: allWorkingKeys.slice(0, MAX_WORKING_MEMORY_KEYS),
          total: allWorkingKeys.length,
          truncated: allWorkingKeys.length > MAX_WORKING_MEMORY_KEYS,
        },
        episodic: { eventCount: brain.episodic.count() },
        recovery: { lastCheckpointAt: lastCheckpoint?.timestamp ?? null },
        // Updated to reflect latest runtime faculty configuration
        faculties: {
          planning: { configured: brain.planning.configured },
          reasoning: { configured: brain.reasoning.configured },
          action: { configured: brain.action.configured },
          learning: { configured: brain.learning.configured },
        },
        capabilities: {
          memoryReview: true,
          retentionReporting: true,
          recordLearning: true,
        },
        lessons: {
          available: false,
          count: null,
        },
      },
    });
  }));

  app.get('/v1/brain/:agentTypeId/episodes', (c) => readBrainState(() => {
    const { brain } = resolveBrain(c, deps.registry);
    const { limit, offset, query } = parseEpisodeQuery(c);
    const readLimit = offset + limit + 1;
    const candidates = query === undefined
      ? brain.episodic.recent(readLimit)
      : brain.episodic.recall(query, readLimit);
    const data = candidates.slice(offset, offset + limit).map(boundEpisode);
    const hasMore = candidates.length > offset + limit;

    return c.json({
      data,
      page: {
        limit,
        offset,
        hasMore,
        ...(hasMore ? { nextOffset: offset + data.length } : {}),
      },
    });
  }));

  app.get('/v1/brain/:agentTypeId/lessons', (c) => readBrainState(() => {
    const { brain } = resolveBrain(c, deps.registry);
    return c.json({
      data: [],
      meta: {
        available: false,
        facultyConfigured: brain.learning.configured,
        reason: 'Consolidated lessons are not available until the learning faculty is configured',
      },
    });
  }));

  return app;
}
