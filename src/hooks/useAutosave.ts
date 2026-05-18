import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { saveToLocalStorage } from '../utils/projectSerialization';

// ═══════════════════════════════════════════════════════════════════
//  useAutosave — debounce saves to localStorage on every project change.
//  1s debounce keeps writes off the hot path during drag/paint while
//  still persisting within a heartbeat of the user pausing.
// ═══════════════════════════════════════════════════════════════════
export function useAutosave(delayMs = 1000): void {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const unsub = useProjectStore.subscribe((state, prev) => {
      if (state.project === prev.project) return; // identity-stable: nothing changed
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        saveToLocalStorage(useProjectStore.getState().project);
        timer.current = null;
      }, delayMs);
    });
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
      unsub();
    };
  }, [delayMs]);
}
