import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatReconnect } from './use-chat-reconnect';

describe('useChatReconnect', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies exponential backoff with jitter and a 10 second cap', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    const refreshSession = vi.fn();
    const { result } = renderHook(() => useChatReconnect(refreshSession));
    const expectedDelays = [600, 1_200, 2_400, 4_800, 9_600, 10_000, 10_000];

    for (const [index, delay] of expectedDelays.entries()) {
      act(() => result.current.beginCycle().schedule());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay - 1);
      });
      expect(refreshSession).toHaveBeenCalledTimes(index);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(refreshSession).toHaveBeenCalledTimes(index + 1);
    }
  });

  it('resets the delay only after the socket reports a ready session', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const refreshSession = vi.fn();
    const { result } = renderHook(() => useChatReconnect(refreshSession));

    act(() => result.current.beginCycle().schedule());
    await act(async () => vi.advanceTimersByTimeAsync(500));

    const openedCycle = result.current.beginCycle();
    act(() => {
      openedCycle.schedule();
    });
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(refreshSession).toHaveBeenCalledTimes(2);

    const readyCycle = result.current.beginCycle();
    act(() => {
      readyCycle.schedule();
      readyCycle.onReady();
    });
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(refreshSession).toHaveBeenCalledTimes(2);
    const nextCycle = result.current.beginCycle();
    act(() => nextCycle.schedule());
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(refreshSession).toHaveBeenCalledTimes(3);
  });

  it('retries transient refresh failures with the next backoff delay', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const refreshSession = vi.fn()
      .mockResolvedValueOnce('retry')
      .mockResolvedValue('complete');
    const { result } = renderHook(() => useChatReconnect(refreshSession));

    act(() => result.current.beginCycle().schedule());
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it('backs off when an immediate reconnect refresh is transiently unavailable', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const refreshSession = vi.fn()
      .mockResolvedValueOnce('retry')
      .mockResolvedValue('complete');
    const { result } = renderHook(() => useChatReconnect(refreshSession));

    act(() => result.current.manualReconnect());
    expect(refreshSession).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(499));
    expect(refreshSession).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it('does not start a manual refresh while an automatic refresh is in flight', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let finishRefresh!: (result: 'complete') => void;
    const refreshSession = vi.fn(() => new Promise<'complete'>((resolve) => {
      finishRefresh = resolve;
    }));
    const { result } = renderHook(() => useChatReconnect(refreshSession));

    act(() => result.current.beginCycle().schedule());
    await act(async () => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.manualReconnect());
    expect(refreshSession).toHaveBeenCalledTimes(1);
    await act(async () => finishRefresh('complete'));
  });

  it('cancels manual retry cycles when the hook unmounts', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const refreshSession = vi.fn().mockResolvedValue('retry');
    const { result, unmount } = renderHook(() => useChatReconnect(refreshSession));

    act(() => result.current.manualReconnect());
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('requires sustained ambiguous setup failures before stopping retries', () => {
    const { result } = renderHook(() => useChatReconnect(vi.fn()));

    for (let attempt = 1; attempt < 8; attempt += 1) {
      expect(result.current.beginCycle().onClose(new CloseEvent('close', { code: 1006 }))).toBe(false);
    }
    expect(result.current.beginCycle().onClose(new CloseEvent('close', { code: 1005 }))).toBe(true);
  });
});
