import { useCallback, useEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_PX = 48;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;
}

export function usePinnedScroll<ContainerElement extends HTMLElement = HTMLDivElement, EndElement extends HTMLElement = HTMLDivElement>(
  updateToken: unknown,
  resetToken: unknown = undefined,
) {
  const containerRef = useRef<ContainerElement>(null);
  const endRef = useRef<EndElement>(null);
  const previousUpdateTokenRef = useRef(updateToken);
  const previousResetTokenRef = useRef(resetToken);
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
    const resetChanged = !Object.is(previousResetTokenRef.current, resetToken);
    const tokenChanged = !Object.is(previousUpdateTokenRef.current, updateToken);
    previousResetTokenRef.current = resetToken;
    previousUpdateTokenRef.current = updateToken;

    if (resetChanged) {
      scrollToLatest('auto');
      return;
    }

    if (isPinnedToBottom) {
      scrollToLatest();
    } else if (tokenChanged) {
      setHasNewItems(true);
    }
  }, [isPinnedToBottom, resetToken, scrollToLatest, updateToken]);

  return {
    containerRef,
    endRef,
    hasNewItems,
    handleScroll,
    scrollToLatest,
  };
}
