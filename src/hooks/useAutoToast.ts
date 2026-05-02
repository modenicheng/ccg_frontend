import { useEffect, useRef } from "react";
import type { ToastVariant } from "../stores/errorToastStore";

interface ToastEntry {
  message: string | null;
  variant: ToastVariant;
}

/**
 * Watches an array of message/variant pairs and pushes a toast only when a
 * message transitions from `null` (or a different string) to a new non-null
 * value.  Replaces N individual `useEffect` blocks that each watched one
 * state variable.
 */
export function useAutoToast(
  entries: ToastEntry[],
  pushToast: (payload: { message: string; variant: ToastVariant }) => void,
) {
  const prevRef = useRef<(string | null)[]>([]);

  useEffect(() => {
    const prev = prevRef.current;
    for (let i = 0; i < entries.length; i++) {
      const { message, variant } = entries[i];
      if (message !== null && message !== (prev[i] ?? null)) {
        pushToast({ message, variant });
      }
    }
    prevRef.current = entries.map((e) => e.message);
  });
}
