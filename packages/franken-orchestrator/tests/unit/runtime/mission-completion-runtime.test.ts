import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProductionMissionCompletionDeps } from '../../../src/runtime/mission-completion-runtime.js';
import { otherwiseCompleteMission } from './mission-completion-fixtures.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('production mission completion dependencies', () => {
  it('returns an authoritative pending status when no evidence source is configured', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    roots.push(root);
    const deps = createProductionMissionCompletionDeps({ root, env: {} });

    const input = await deps.getInput();

    expect(input.missionId).toBe('smart-swarm-runtime');
    expect(input.alerts).toContain('mission completion evidence source is not configured');
  });

  it('refuses privileged job stops from evidence stored inside the project root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    roots.push(root);
    const inputPath = join(root, '.fbeast', 'mission-completion.json');
    mkdirSync(join(root, '.fbeast'));
    const mission = otherwiseCompleteMission();
    writeFileSync(inputPath, JSON.stringify(mission));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const deps = createProductionMissionCompletionDeps({
      root,
      env: { FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'https://control.example.invalid/stop' },
      fetchImpl: fetchMock,
      now: () => new Date(mission.checkedAt),
    });

    const input = await deps.getInput();

    expect(input.alerts).toContain(
      'mission completion control evidence must be stored outside the project root',
    );
    await expect(deps.stopJobs(['controller-job'], 'mission-stop:v1:forged')).rejects.toThrow(
      'trusted external mission completion evidence',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a configured evidence source that is not a regular file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    roots.push(root);
    const deps = createProductionMissionCompletionDeps({
      root,
      env: {
        FRANKENBEAST_MISSION_COMPLETION_INPUT: '/dev/null',
        FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'https://control.example.invalid/stop',
      },
    });

    await expect(deps.getInput()).rejects.toThrow('mission completion input must be a regular file');
  });

  it('injects the server-configured required external gate inventory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'mission-evidence-'));
    roots.push(root, evidenceRoot);
    const inputPath = join(evidenceRoot, 'mission.json');
    const mission = otherwiseCompleteMission();
    writeFileSync(inputPath, JSON.stringify(mission));
    const deps = createProductionMissionCompletionDeps({
      root,
      env: {
        FRANKENBEAST_MISSION_COMPLETION_INPUT: inputPath,
        FRANKENBEAST_MISSION_COMPLETION_REQUIRED_GATES: 'deployment-gate, public-acceptance',
        FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'https://control.example.invalid/stop',
      },
      now: () => new Date(mission.checkedAt),
    });

    const input = await deps.getInput();

    expect(input.requiredExternalGateIds).toEqual(['deployment-gate', 'public-acceptance']);
  });

  it('loads production evidence and calls the configured stop endpoint idempotently', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'mission-evidence-'));
    roots.push(root, evidenceRoot);
    const inputPath = join(evidenceRoot, 'mission.json');
    const mission = otherwiseCompleteMission();
    mission.externalGates = [{
      id: 'public-acceptance', state: 'passed', owner: 'acceptance-worker', head: '3333333333333333333333333333333333333333',
      trigger: 'deployment verified', nextTransition: 'terminalize mission', scope: { kind: 'deployed-sha' },
    }];
    writeFileSync(inputPath, JSON.stringify(mission));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const deps = createProductionMissionCompletionDeps({
      root,
      env: {
        FRANKENBEAST_MISSION_COMPLETION_INPUT: inputPath,
        FRANKENBEAST_MISSION_COMPLETION_REQUIRED_GATES: 'public-acceptance',
        FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'https://control.example.invalid/stop',
        FRANKENBEAST_MISSION_COMPLETION_STOP_TOKEN: 'secret-token',
      },
      fetchImpl: fetchMock,
      now: () => new Date(mission.checkedAt),
    });

    await expect(deps.getInput()).resolves.toEqual(mission);
    await deps.stopJobs(['controller-job'], 'mission-stop:v1:abc');

    expect(fetchMock).toHaveBeenCalledWith('https://control.example.invalid/stop', {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
        'idempotency-key': 'mission-stop:v1:abc',
      },
      body: JSON.stringify({ jobIds: ['controller-job'], stopOnceKey: 'mission-stop:v1:abc' }),
      signal: expect.any(AbortSignal),
    });
  });

  it('evaluates file evidence against server time instead of a stale self-reported check time', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    roots.push(root);
    const inputPath = join(root, 'mission.json');
    const mission = otherwiseCompleteMission();
    writeFileSync(inputPath, JSON.stringify(mission));
    const deps = createProductionMissionCompletionDeps({
      root,
      env: {
        FRANKENBEAST_MISSION_COMPLETION_INPUT: inputPath,
        FRANKENBEAST_MISSION_COMPLETION_REQUIRED_GATES: 'public-acceptance',
        FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'https://control.example.invalid/stop',
      },
      now: () => new Date('2026-07-28T03:10:00.000Z'),
    });

    const input = await deps.getInput();

    expect(input.checkedAt).toBe('2026-07-28T03:10:00.000Z');
  });

  it('allows an explicit IPv6 loopback HTTP stop endpoint', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'mission-evidence-'));
    roots.push(root, evidenceRoot);
    const inputPath = join(evidenceRoot, 'mission.json');
    const mission = otherwiseCompleteMission();
    writeFileSync(inputPath, JSON.stringify(mission));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const deps = createProductionMissionCompletionDeps({
      root,
      env: {
        FRANKENBEAST_MISSION_COMPLETION_INPUT: inputPath,
        FRANKENBEAST_MISSION_COMPLETION_REQUIRED_GATES: 'public-acceptance',
        FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'http://[::1]:8080/stop',
      },
      fetchImpl: fetchMock,
      now: () => new Date(mission.checkedAt),
    });

    await deps.getInput();
    await expect(deps.stopJobs(['controller-job'], 'mission-stop:v1:ipv6')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects redirects from the completion stop endpoint', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mission-completion-'));
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'mission-evidence-'));
    roots.push(root, evidenceRoot);
    const inputPath = join(evidenceRoot, 'mission.json');
    const mission = otherwiseCompleteMission();
    writeFileSync(inputPath, JSON.stringify(mission));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const deps = createProductionMissionCompletionDeps({
      root,
      env: {
        FRANKENBEAST_MISSION_COMPLETION_INPUT: inputPath,
        FRANKENBEAST_MISSION_COMPLETION_REQUIRED_GATES: 'public-acceptance',
        FRANKENBEAST_MISSION_COMPLETION_STOP_URL: 'https://control.example.invalid/stop',
      },
      fetchImpl: fetchMock,
      now: () => new Date(mission.checkedAt),
    });

    await deps.getInput();
    await deps.stopJobs(['controller-job'], 'mission-stop:v1:no-redirect');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://control.example.invalid/stop',
      expect.objectContaining({ redirect: 'error' }),
    );
  });
});
