import { useCallback, useEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_PX = 48;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;
}

export function usePinnedScroll(updateToken: unknown) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const previousUpdateTokenRef = useRef(updateToken);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [hasNewItems, setHasNewItems] = useState(false);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior, block: 'end' });
    }
    setIsPinnedToBottom(true);
    setHasNewItems(false);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const pinned = isNearBottom(container);
    setIsPinnedToBottom(pinned);
    if (pinned) {
      setHasNewItems(false);
    }
  }, []);

  useEffect(() => {
    const tokenChanged = !Object.is(previousUpdateTokenRef.current, updateToken);
    previousUpdateTokenRef.current = updateToken;

    if (isPinnedToBottom) {
      scrollToLatest();
    } else if (tokenChanged) {
      setHasNewItems(true);
    }
  }, [isPinnedToBottom, scrollToLatest, updateToken]);

  return {
    containerRef,
    endRef,
    hasNewItems,
    handleScroll,
    scrollToLatest,
  };
}
