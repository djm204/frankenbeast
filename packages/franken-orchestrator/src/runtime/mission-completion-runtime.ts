import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { MissionCompletionInput } from './mission-completion.js';

const MAX_INPUT_BYTES = 1_048_576;
const STOP_REQUEST_TIMEOUT_MS = 10_000;

const WorkItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['canonical', 'recovery', 'successor', 'deployment', 'acceptance', 'verification', 'synthesis']),
  status: z.enum(['todo', 'ready', 'running', 'blocked', 'done', 'archived']),
  owner: z.string().nullable(),
  linkedCanonicalId: z.string().nullable(),
});

const MissionCompletionInputSchema = z.object({
  missionId: z.string(),
  checkedAt: z.string(),
  evidenceMaxAgeMs: z.number(),
  completionJobs: z.array(z.object({ id: z.string(), missionId: z.string() })),
  alerts: z.array(z.string()),
  scopedIssues: z.array(z.object({
    issue: z.number(),
    canonicalWorkItemId: z.string().optional(),
    implementationState: z.enum(['implemented', 'pending']),
    reviewedHead: z.string().nullable(),
    mergeSha: z.string().nullable(),
    mergedReviewedHead: z.string().nullable().optional(),
  })),
  workItems: z.array(WorkItemSchema),
  requiredExternalGateIds: z.array(z.string()).optional(),
  externalGates: z.array(z.object({
    id: z.string(),
    state: z.enum(['pending', 'passed']),
    owner: z.string().nullable(),
    head: z.string().nullable(),
    trigger: z.string().nullable(),
    nextTransition: z.string().nullable(),
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('issue-reviewed-head'), issue: z.number() }),
      z.object({ kind: z.literal('deployed-sha') }),
    ]).optional(),
  })),
  deployment: z.object({
    state: z.enum(['pending', 'deployed']),
    reviewedMainSha: z.string().nullable(),
    deployedSha: z.string().nullable(),
    includedMergeShas: z.array(z.string()),
    endpointChecks: z.array(z.object({
      endpoint: z.string(),
      status: z.enum(['passed', 'failed']),
      checkedAt: z.string(),
      deployedSha: z.string().optional(),
    })),
    verifiedAt: z.string().nullable(),
  }),
  acceptance: z.object({
    issue3815Passed: z.boolean(),
    authenticatedPublicRealDataPassed: z.boolean(),
    deployedSha: z.string().nullable(),
    evidenceId: z.string().nullable(),
    verifiedAt: z.string().nullable(),
  }),
});

export interface ProductionMissionCompletionOptions {
  root: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface ProductionMissionCompletionDeps {
  getInput(): Promise<MissionCompletionInput>;
  stopJobs(jobIds: string[], stopOnceKey: string): Promise<void>;
}

function pendingInput(now: Date): MissionCompletionInput {
  return {
    missionId: 'smart-swarm-runtime',
    checkedAt: now.toISOString(),
    evidenceMaxAgeMs: 300_000,
    completionJobs: [],
    alerts: ['mission completion evidence source is not configured'],
    scopedIssues: [],
    workItems: [],
    requiredExternalGateIds: [],
    externalGates: [],
    deployment: {
      state: 'pending', reviewedMainSha: null, deployedSha: null, includedMergeShas: [],
      endpointChecks: [], verifiedAt: null,
    },
    acceptance: {
      issue3815Passed: false, authenticatedPublicRealDataPassed: false,
      deployedSha: null, evidenceId: null, verifiedAt: null,
    },
  };
}

function completionInputPath(root: string, env: Record<string, string | undefined>): string {
  const configured = env.FRANKENBEAST_MISSION_COMPLETION_INPUT;
  if (!configured) return join(root, '.fbeast', 'mission-completion.json');
  return isAbsolute(configured) ? configured : resolve(root, configured);
}

function validatedStopUrl(value: string): string {
  const url = new URL(value);
  const localHttp = url.protocol === 'http:'
    && ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('FRANKENBEAST_MISSION_COMPLETION_STOP_URL must use HTTPS or loopback HTTP');
  }
  return url.toString();
}

function readBoundedRegularFile(path: string): string {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) throw new Error('mission completion input must be a regular file');
    if (stat.size > MAX_INPUT_BYTES) {
      throw new Error(`mission completion input exceeds ${MAX_INPUT_BYTES} bytes`);
    }
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunkSize = readSync(
        descriptor,
        buffer,
        bytesRead,
        buffer.length - bytesRead,
        bytesRead,
      );
      if (chunkSize === 0) break;
      bytesRead += chunkSize;
    }
    if (bytesRead > MAX_INPUT_BYTES) {
      throw new Error(`mission completion input exceeds ${MAX_INPUT_BYTES} bytes`);
    }
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

export function createProductionMissionCompletionDeps(
  options: ProductionMissionCompletionOptions,
): ProductionMissionCompletionDeps {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const inputPath = completionInputPath(options.root, env);
  const stopUrl = env.FRANKENBEAST_MISSION_COMPLETION_STOP_URL;
  const stopToken = env.FRANKENBEAST_MISSION_COMPLETION_STOP_TOKEN;
  const configuredInputPath = env.FRANKENBEAST_MISSION_COMPLETION_INPUT;
  const requiredExternalGateIds = [...new Set(
    (env.FRANKENBEAST_MISSION_COMPLETION_REQUIRED_GATES ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )].sort();
  let trustedEvidenceLoaded = false;

  return {
    async getInput() {
      trustedEvidenceLoaded = false;
      let input: MissionCompletionInput;
      try {
        const resolvedInputPath = realpathSync(inputPath);
        input = MissionCompletionInputSchema.parse(
          JSON.parse(readBoundedRegularFile(resolvedInputPath)),
        ) as unknown as MissionCompletionInput;
        const rootRelativePath = relative(realpathSync(options.root), resolvedInputPath);
        trustedEvidenceLoaded = Boolean(
          configuredInputPath
          && isAbsolute(configuredInputPath)
          && (
            rootRelativePath === '..'
            || rootRelativePath.startsWith(`..${sep}`)
            || isAbsolute(rootRelativePath)
          ),
        );
      } catch (error) {
        const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
        if (!missing) throw error;
        return pendingInput(now());
      }
      const serverCheckedInput = {
        ...input,
        checkedAt: now().toISOString(),
        requiredExternalGateIds,
      };
      if (stopUrl && !trustedEvidenceLoaded) {
        return {
          ...serverCheckedInput,
          alerts: [
            ...serverCheckedInput.alerts,
            'mission completion control evidence must be stored outside the project root',
          ],
        };
      }
      if (!stopUrl) {
        return {
          ...serverCheckedInput,
          alerts: [...serverCheckedInput.alerts, 'mission completion stop endpoint is not configured'],
        };
      }
      if (requiredExternalGateIds.length === 0) {
        return {
          ...serverCheckedInput,
          alerts: [
            ...serverCheckedInput.alerts,
            'mission completion required external gates are not configured',
          ],
        };
      }
      return serverCheckedInput;
    },

    async stopJobs(jobIds, stopOnceKey) {
      if (!trustedEvidenceLoaded) {
        throw new Error('job stops require trusted external mission completion evidence');
      }
      if (requiredExternalGateIds.length === 0) {
        throw new Error('job stops require a server-configured external gate inventory');
      }
      if (!stopUrl) throw new Error('mission completion stop endpoint is not configured');
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'idempotency-key': stopOnceKey,
      };
      if (stopToken) headers.authorization = `Bearer ${stopToken}`;
      const response = await fetchImpl(validatedStopUrl(stopUrl), {
        method: 'POST',
        redirect: 'error',
        headers,
        body: JSON.stringify({ jobIds, stopOnceKey }),
        signal: AbortSignal.timeout(STOP_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`mission completion stop endpoint returned HTTP ${response.status}`);
    },
  };
}
