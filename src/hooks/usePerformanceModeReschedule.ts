import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { rescheduleFromTick } from '../audio/toneEngine';

// ═══════════════════════════════════════════════════════════════════
//  usePerformanceModeReschedule (#56)
//  When performance mode is ON and playback is active, every change to
//  project.tracks is rebroadcast to the Tone transport so the edit is
//  audible within ~50ms. Off-mode is a no-op.
// ═══════════════════════════════════════════════════════════════════
const RESCHEDULE_DEBOUNCE_MS = 50;

export function usePerformanceModeReschedule(): void {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const unsub = useProjectStore.subscribe((state, prev) => {
      const perf = state.project.settings.performanceMode;
      if (!perf || !state.isPlaying) return;
      // Only react to track / note edits — ignore viewport / playhead / etc.
      if (state.project.tracks === prev.project.tracks) return;

      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const s = useProjectStore.getState();
        rescheduleFromTick(s.project, s.playheadTick);
        timer.current = null;
      }, RESCHEDULE_DEBOUNCE_MS);
    });
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
      unsub();
    };
  }, []);
}
