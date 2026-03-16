import { useEffect, useRef, type ReactNode } from 'react';

interface SlideInPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function SlideInPanel({ isOpen, onClose, children }: SlideInPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (isOpen && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <aside
      ref={panelRef}
      aria-hidden={!isOpen}
      className={`fixed top-0 right-0 h-screen w-[45vw] min-w-[400px] max-w-[720px]
        bg-beast-panel border-l border-beast-border shadow-2xl z-50
        transition-transform duration-200 ease-out flex flex-col
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {children}
    </aside>
  );
}
