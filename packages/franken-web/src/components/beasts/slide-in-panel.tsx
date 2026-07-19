import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, type ReactNode } from 'react';

interface SlideInPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

function isPortalClick(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;

  const targetElement = target instanceof Element
    ? target
    : target.parentElement;

  return Boolean(targetElement?.closest('[data-beast-panel-portal="true"], [data-beast-dialog-layer]'));
}

function hasFocusMovedOutside(panel: HTMLElement | null): boolean {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement
    && activeElement !== document.body
    && !panel?.contains(activeElement);
}

export function SlideInPanel({ isOpen, onClose, children, title = 'Details' }: SlideInPanelProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const shouldRestoreFocusRef = useRef(true);
  const wasOpenRef = useRef(false);

  if (isOpen !== wasOpenRef.current) {
    wasOpenRef.current = isOpen;
    if (isOpen) {
      openerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    shouldRestoreFocusRef.current = true;

    return () => {
      const opener = openerRef.current;
      if (shouldRestoreFocusRef.current && !hasFocusMovedOutside(panelRef.current) && opener?.isConnected) {
        opener.focus();
      }
      openerRef.current = null;
    };
  }, [isOpen]);

  return (
    <Dialog.Root
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          ref={panelRef}
          aria-describedby={undefined}
          className="fixed top-0 right-0 h-screen w-[45vw] min-w-[400px] max-w-[720px]
            bg-beast-panel border-l border-beast-border shadow-2xl z-50
            flex flex-col animate-in slide-in-from-right duration-200"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (shouldRestoreFocusRef.current && !hasFocusMovedOutside(panelRef.current)) {
              openerRef.current?.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (document.querySelector('[data-beast-panel-portal="true"], [data-beast-dialog-layer]')) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isPortalClick(event.target)) {
              event.preventDefault();
            } else {
              shouldRestoreFocusRef.current = false;
            }
          }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
