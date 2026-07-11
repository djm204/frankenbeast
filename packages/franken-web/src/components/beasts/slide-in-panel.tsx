import { useEffect, useRef, type ReactNode } from 'react';

interface SlideInPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

function isPortalClick(target: Node | null): boolean {
  if (!(target instanceof Node)) return false;

  const targetElement = target instanceof Element
    ? target
    : target.parentElement;

  return Boolean(targetElement?.closest('[data-beast-panel-portal="true"], [data-beast-dialog-layer]'));
}

export function SlideInPanel({ isOpen, onClose, children }: SlideInPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !document.querySelector('[data-beast-panel-portal="true"], [data-beast-dialog-layer]')) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (isPortalClick(target)) return;

      if (isOpen && panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <aside
      ref={panelRef}
      className="fixed top-0 right-0 h-screen w-[45vw] min-w-[400px] max-w-[720px]
        bg-beast-panel border-l border-beast-border shadow-2xl z-50
        flex flex-col animate-in slide-in-from-right duration-200"
    >
      {children}
    </aside>
  );
}
