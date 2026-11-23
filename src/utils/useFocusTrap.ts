import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Traps keyboard Tab focus within an open modal container and restores focus
 * to the previously active element when the modal closes.
 */
export function useFocusTrap(open: boolean, containerRef: RefObject<HTMLElement | null>): void {
  const prevFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    prevFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const prev = prevFocusedRef.current;
      prevFocusedRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [open, containerRef]);
}
