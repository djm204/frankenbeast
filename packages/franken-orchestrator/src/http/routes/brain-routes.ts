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
  resolveContext?: ((agentTypeId: string) => BrainRouteContext | undefined) | undefined;
  operatorToken: string;
  security: TransportSecurityService;
  rateLimit?: BeastRateLimitOptions;
}

export interface BrainRouteContext {
  dbPath?: string | undefined;
  faculties?: Partial<Record<'planning' | 'reasoning' | 'action' | 'learning', boolean>> | undefined;
}

function resolveBrain(c: Context, deps: BrainRoutesDeps): {
  agentTypeId: string;
  brain: SqliteBrain;
  context: BrainRouteContext | undefined;
} {
  const agentTypeId = c.req.param('agentTypeId') ?? '';
  let brain: SqliteBrain | undefined;
  let context: BrainRouteContext | undefined;
  try {
    context = deps.resolveContext?.(agentTypeId);
    brain = deps.registry.getAgentType(agentTypeId, context?.dbPath);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new HttpError(400, 'INVALID_AGENT_TYPE_ID', 'agentTypeId is invalid');
    }
    throw error;
  }
  if (!brain) {
    throw new HttpError(404, 'BRAIN_NOT_FOUND', 'No brain exists for the requested agent type');
  }
  return { agentTypeId, brain, context };
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

function boundEpisode(event: EpisodicEvent & { detailsTruncated?: true }) {
  const step = event.step === undefined
    ? undefined
    : truncateUtf8(event.step, MAX_EPISODE_STEP_BYTES);
  const summary = truncateUtf8(event.summary, MAX_EPISODE_SUMMARY_BYTES);
  const createdAt = truncateUtf8(event.createdAt, MAX_EPISODE_TIMESTAMP_BYTES);
  const detailsTooLarge = event.detailsTruncated === true || (event.details !== undefined
    && Buffer.byteLength(JSON.stringify(event.details)) > MAX_EPISODE_DETAILS_BYTES
  );
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
    const { agentTypeId, brain, context } = resolveBrain(c, deps);
    const allWorkingKeys = brain.working.persistedKeys();
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
        faculties: {
          planning: { configured: context?.faculties?.planning ?? brain.planning.configured },
          reasoning: { configured: context?.faculties?.reasoning ?? brain.reasoning.configured },
          action: { configured: context?.faculties?.action ?? brain.action.configured },
          learning: { configured: context?.faculties?.learning ?? brain.learning.configured },
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
    const { brain } = resolveBrain(c, deps);
    const { limit, offset, query } = parseEpisodeQuery(c);
    const candidates = brain.episodic.readBoundedPage({
      limit: limit + 1,
      offset,
      ...(query === undefined ? {} : { query }),
      maxDetailsBytes: MAX_EPISODE_DETAILS_BYTES,
    });
    const data = candidates.slice(0, limit).map(boundEpisode);
    const hasMore = candidates.length > limit;

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
    const { brain, context } = resolveBrain(c, deps);
    return c.json({
      data: [],
      meta: {
        available: false,
        facultyConfigured: context?.faculties?.learning ?? brain.learning.configured,
        reason: 'Consolidated lessons are not available until the learning faculty is configured',
      },
    });
  }));

  return app;
}
