import { useRef } from 'react';
import type { MouseEvent } from 'react';

/**
 * Props for a modal backdrop that closes only on a real click on the backdrop.
 * A drag that starts inside the modal (e.g. selecting text in an input) and
 * ends on the backdrop must not close it.
 */
export function useBackdropClose(onClose: () => void) {
  const pressedOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: MouseEvent) => {
      pressedOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose();
      pressedOnBackdrop.current = false;
    },
  };
}
