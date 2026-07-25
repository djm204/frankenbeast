import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrainPanel } from './brain-panel';
import type {
  DashboardApiClient,
  DashboardBrainLessons,
  DashboardBrainState,
} from '../../lib/dashboard-api';

const brainState: DashboardBrainState = {
  agentTypeId: 'reviewer',
  workingMemory: { keys: ['goal'], total: 1, truncated: false },
  episodic: { eventCount: 3 },
  recovery: { lastCheckpointAt: '2026-07-25T01:02:03.000Z' },
  faculties: {
    planning: { configured: true },
    reasoning: { configured: false },
    action: { configured: true },
    learning: { configured: true },
  },
  capabilities: { memoryReview: true, retentionReporting: true, recordLearning: true },
  lessons: { available: true, count: null },
};

const emptyLessons: DashboardBrainLessons = {
  data: [],
  meta: { available: true, facultyConfigured: true },
};

function mockClient(overrides: Partial<DashboardApiClient> = {}): DashboardApiClient {
  return {
    fetchBrainState: vi.fn().mockResolvedValue(brainState),
    fetchBrainLessons: vi.fn().mockResolvedValue(emptyLessons),
    ...overrides,
  } as unknown as DashboardApiClient;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

afterEach(cleanup);

describe('BrainPanel', () => {
  it('starts with an accessible empty state and does not invent an agent type', () => {
    const client = mockClient();

    render(<BrainPanel client={client} />);

    expect(screen.getByRole('region', { name: 'Brain faculties' })).toBeTruthy();
    expect(screen.getByLabelText('Agent type')).toBeTruthy();
    expect(screen.getByText('Enter an agent type to inspect its persisted Brain state.')).toBeTruthy();
    expect(client.fetchBrainState).not.toHaveBeenCalled();
  });

  it('renders loading and truthful memory, faculty, recovery, and lesson availability state', async () => {
    const stateRequest = deferred<DashboardBrainState>();
    const lessonsRequest = deferred<DashboardBrainLessons>();
    const client = mockClient({
      fetchBrainState: vi.fn().mockReturnValue(stateRequest.promise),
      fetchBrainLessons: vi.fn().mockReturnValue(lessonsRequest.promise),
    });
    render(<BrainPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: ' reviewer ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Brain' }));

    expect(screen.getByRole('status').textContent).toContain('Loading Brain state for reviewer');
    stateRequest.resolve(brainState);

    const region = await screen.findByRole('region', { name: 'Brain faculties for reviewer' });
    expect(screen.getByRole('status').textContent).toContain('Loading lesson availability');
    lessonsRequest.resolve(emptyLessons);
    await waitFor(() => expect(region.textContent).toContain('The Brain API does not expose an unfiltered recent lesson feed.'));
    expect(region.textContent).toContain('Memory');
    expect(region.textContent).toContain('1 persisted key');
    expect(region.textContent).toContain('3 episodic events');
    expect(region.textContent).toContain('Planning');
    expect(region.textContent).toContain('Reasoning');
    expect(region.textContent).toContain('[not configured]');
    expect(region.textContent).toContain('2026-07-25T01:02:03.000Z');

    expect(client.fetchBrainState).toHaveBeenCalledWith('reviewer');
    expect(client.fetchBrainLessons).toHaveBeenCalledWith('reviewer', undefined, 5);
  });

  it('surfaces a read error and retries the selected agent type', async () => {
    const client = mockClient({
      fetchBrainState: vi.fn()
        .mockRejectedValueOnce(new Error('No brain exists for the requested agent type'))
        .mockResolvedValueOnce(brainState),
    });
    render(<BrainPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: 'reviewer' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Select Brain agent type' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Unable to load Brain state for reviewer. No brain exists for the requested agent type',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry reviewer' }));

    expect(await screen.findByRole('region', { name: 'Brain faculties for reviewer' })).toBeTruthy();
    expect(client.fetchBrainState).toHaveBeenCalledTimes(2);
  });

  it('keeps a successful faculty summary visible when the lesson read fails', async () => {
    const client = mockClient({
      fetchBrainLessons: vi.fn().mockRejectedValue(new Error('HTTP 503')),
    });
    render(<BrainPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: 'reviewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Brain' }));

    const region = await screen.findByRole('region', { name: 'Brain faculties for reviewer' });
    expect(region.textContent).toContain('Memory');
    expect(region.textContent).toContain('Planning');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Unable to load lessons for reviewer. HTTP 503',
    );
    expect(region.textContent).not.toContain('[unavailable]');
  });

  it('allows selecting another Brain while the previous lesson availability read is pending', async () => {
    const firstLessonsRequest = deferred<DashboardBrainLessons>();
    const client = mockClient({
      fetchBrainState: vi.fn()
        .mockResolvedValueOnce(brainState)
        .mockResolvedValueOnce({ ...brainState, agentTypeId: 'planner' }),
      fetchBrainLessons: vi.fn()
        .mockReturnValueOnce(firstLessonsRequest.promise)
        .mockResolvedValueOnce(emptyLessons),
    });
    render(<BrainPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: 'reviewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Brain' }));
    await screen.findByRole('region', { name: 'Brain faculties for reviewer' });

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: 'planner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Brain' }));

    expect(await screen.findByRole('region', { name: 'Brain faculties for planner' })).toBeTruthy();
    expect(client.fetchBrainState).toHaveBeenLastCalledWith('planner');
  });

  it('shows the backend lesson-unavailable reason instead of an empty lesson claim', async () => {
    const client = mockClient({
      fetchBrainState: vi.fn().mockResolvedValue({
        ...brainState,
        faculties: { ...brainState.faculties, learning: { configured: false } },
        lessons: { available: false, count: null },
      }),
      fetchBrainLessons: vi.fn().mockResolvedValue({
        data: [],
        meta: {
          available: false,
          facultyConfigured: false,
          reason: 'Consolidated lessons are not available until the learning faculty is configured',
        },
      }),
    });
    render(<BrainPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: 'reviewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Brain' }));

    expect(await screen.findByText(
      'Consolidated lessons are not available until the learning faculty is configured',
    )).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search lessons' }).hasAttribute('disabled')).toBe(true);
  });

  it('searches real lessons by topic and renders bounded lesson evidence as text', async () => {
    const lesson: DashboardBrainLessons['data'][number] = {
      kind: 'consolidated-lesson',
      key: 'lesson-1',
      status: 'approved',
      pattern: 'Run <script>alert(1)</script> focused tests before the workspace build',
      keywords: ['tests', 'build'],
      occurrenceCount: 4,
      confidence: 0.4,
      evidenceEventIds: [1, 2, 3, 4],
      firstSeenAt: '2026-07-24T01:00:00.000Z',
      lastSeenAt: '2026-07-25T01:00:00.000Z',
      relevance: 0.9,
    };
    const client = mockClient({
      fetchBrainLessons: vi.fn()
        .mockResolvedValueOnce(emptyLessons)
        .mockResolvedValueOnce({ data: [lesson], meta: emptyLessons.meta }),
    });
    render(<BrainPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: 'reviewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Brain' }));
    await screen.findByRole('region', { name: 'Brain faculties for reviewer' });
    fireEvent.change(screen.getByLabelText('Lesson topic'), { target: { value: ' workspace build ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search lessons' }));

    await waitFor(() => expect(client.fetchBrainLessons).toHaveBeenLastCalledWith('reviewer', 'workspace build', 5));
    expect(await screen.findByText(/Run <script>alert\(1\)<\/script> focused tests/)).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/approved · 4 occurrences · 40% confidence/)).toBeTruthy();
  });

  it('does not relabel stale lesson results as matches while a new search is pending or failed', async () => {
    const oldLesson: DashboardBrainLessons['data'][number] = {
      kind: 'consolidated-lesson',
      key: 'old-lesson',
      status: 'approved',
      pattern: 'Old workspace lesson',
      keywords: ['workspace'],
      occurrenceCount: 2,
      confidence: 0.5,
      evidenceEventIds: [1, 2],
      firstSeenAt: '2026-07-24T01:00:00.000Z',
      lastSeenAt: '2026-07-25T01:00:00.000Z',
      relevance: 1,
    };
    const nextSearch = deferred<DashboardBrainLessons>();
    const client = mockClient({
      fetchBrainLessons: vi.fn()
        .mockResolvedValueOnce(emptyLessons)
        .mockResolvedValueOnce({ data: [oldLesson], meta: emptyLessons.meta })
        .mockReturnValueOnce(nextSearch.promise),
    });
    render(<BrainPanel client={client} />);

    fireEvent.change(screen.getByLabelText('Agent type'), { target: { value: 'reviewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Brain' }));
    await screen.findByRole('region', { name: 'Brain faculties for reviewer' });
    fireEvent.change(screen.getByLabelText('Lesson topic'), { target: { value: 'workspace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search lessons' }));
    expect(await screen.findByText('Old workspace lesson')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Lesson topic'), { target: { value: 'security' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search lessons' }));

    expect(screen.queryByText('Old workspace lesson')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Searching lessons');
    nextSearch.reject(new Error('HTTP 503'));
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to search lessons for reviewer. HTTP 503');
    expect(screen.queryByText('Old workspace lesson')).toBeNull();
  });
});
