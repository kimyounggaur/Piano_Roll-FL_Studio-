import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { SNAP_KEY_TO_UNIT } from '../utils/snapShortcuts';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

export function useArrangementShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const store = useProjectStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'c') { e.preventDefault(); store.copySelectedClips(); return; }
      if (ctrl && key === 'x') { e.preventDefault(); store.cutSelectedClips(); return; }
      if (ctrl && key === 'v') { e.preventDefault(); store.pasteClips(); return; }
      if (ctrl && key === 'd') { e.preventDefault(); store.duplicateSelectedClips(); return; }
      if (ctrl && key === 'a') { e.preventDefault(); store.selectAllClips(); return; }
      if (e.key === 'Escape') { store.deselectAllClips(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.deleteSelectedClips(); return; }
      if (ctrl && e.key === 'Insert') { e.preventDefault(); store.insertSpace(store.playheadTick, store.snapTicks()); return; }
      if (ctrl && e.key === 'Delete') { e.preventDefault(); store.deleteSpace(store.project.settings.loopStartTick, store.project.settings.loopEndTick); return; }
      if (ctrl && key === 'g' && shift) { e.preventDefault(); store.mergeSimilarPatternClips(); return; }
      if (ctrl && key === 'g') { e.preventDefault(); store.mergePatternClips(); return; }
      if (ctrl && key === 'q') { e.preventDefault(); store.quantizeSelectedClipStartTimes(); return; }
      if (e.altKey && key === 'm') { e.preventDefault(); store.toggleSelectedClipsMute(); return; }
      if (!ctrl && !shift && !e.altKey && SNAP_KEY_TO_UNIT[e.key]) {
        e.preventDefault();
        store.setSnapUnit(SNAP_KEY_TO_UNIT[e.key]);
        store.setPlaylistView({ snapMode: 'main' });
        return;
      }
      if (key === '7') { store.pitchSelectedAudioClips(1); return; }
      if (key === '8') { store.pitchSelectedAudioClips(-1); return; }
      if (key === '9') { store.reverseSelectedAudioClips(); return; }
      if (e.key === 'ArrowLeft' && ctrl) { e.preventDefault(); store.selectAdjacentTime('prev'); return; }
      if (e.key === 'ArrowRight' && ctrl) { e.preventDefault(); store.selectAdjacentTime('next'); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); store.shiftSelectedClips('left'); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); store.shiftSelectedClips('right'); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); store.shiftSelectedClips('up'); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); store.shiftSelectedClips('down'); return; }
      if (shift && key === 'i') { e.preventDefault(); store.invertClipSelection(); return; }
      if (shift && key === 'c') {
        const clipId = [...store.selectedClipIds][0];
        if (clipId) store.selectBySource(clipId);
        return;
      }
      if (shift && key === 'g') { e.preventDefault(); store.groupSelectedTracks(); return; }
      if (ctrl && e.key === 'Enter') { e.preventDefault(); store.selectTimeAroundSelection(); return; }
      if (e.key === 'PageUp') { e.preventDefault(); store.zoomInPlaylist(); return; }
      if (e.key === 'PageDown') { e.preventDefault(); store.zoomOutPlaylist(); return; }
      if (shift && key === '1') { e.preventDefault(); store.setPlaylistZoomPreset('1'); return; }
      if (shift && key === '2') { e.preventDefault(); store.setPlaylistZoomPreset('2'); return; }
      if (shift && key === '3') { e.preventDefault(); store.setPlaylistZoomPreset('3'); return; }
      if (shift && key === '4') { e.preventDefault(); store.setPlaylistZoomPreset('far'); return; }
      if (shift && key === '5') { e.preventDefault(); store.setPlaylistZoomPreset('selection'); return; }
      if (shift && key === '6') { e.preventDefault(); store.setPlaylistZoomPreset('performance'); return; }
      if (shift && key === '0') { e.preventDefault(); store.centerPlaylistView(); return; }
      if (e.altKey && key === 't') { e.preventDefault(); store.addPlaylistMarker(store.playheadTick, 'none'); return; }
      if (ctrl && key === 't') { e.preventDefault(); store.addPlaylistMarker(store.playheadTick, 'loop', 'Loop'); return; }
      if (shift && key === 't') { e.preventDefault(); store.placeLoop(store.project.settings.loopStartTick, store.project.settings.loopEndTick); return; }
      if (ctrl && key === 'p') { e.preventDefault(); store.setPerformanceModeEnabled(!store.performanceMode.enabled); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
