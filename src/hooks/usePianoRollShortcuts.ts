import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import type { Note, PianoRollTool } from '../types/music';

// ═══════════════════════════════════════════════════════════════════
//  Clipboard
//  Module-level so the buffer survives component re-mounts within the
//  same browser session. Stores notes relative to their bounding box
//  origin so paste re-anchors at the playhead.
// ═══════════════════════════════════════════════════════════════════
interface ClipboardEntry {
  pitch: number;
  startOffset: number;     // relative to clipboard origin tick
  durationTicks: number;
  velocity: number;
  muted?: boolean;
  colorGroup?: string;
}
let clipboard: ClipboardEntry[] = [];

// ═══════════════════════════════════════════════════════════════════
//  Shortcut catalogue (also rendered by the help modal)
// ═══════════════════════════════════════════════════════════════════
export interface ShortcutSpec {
  keys: string;
  description: string;
  group: 'transport' | 'tool' | 'edit' | 'move' | 'view';
}

export const SHORTCUT_CATALOG: ShortcutSpec[] = [
  { keys: 'Space',           description: '재생 / 정지',              group: 'transport' },
  { keys: 'P',               description: 'Draw 툴',                  group: 'tool' },
  { keys: 'V',               description: 'Select 툴',                group: 'tool' },
  { keys: 'B',               description: 'Paint 툴',                 group: 'tool' },
  { keys: 'E',               description: 'Erase 툴',                 group: 'tool' },
  { keys: 'S',               description: 'Slice 툴',                 group: 'tool' },
  { keys: 'C',               description: 'Stamp 툴',                 group: 'tool' },
  { keys: 'Delete / ⌫',      description: '선택 노트 삭제',           group: 'edit' },
  { keys: 'Ctrl/⌘ + A',      description: '모든 노트 선택',           group: 'edit' },
  { keys: 'Ctrl/⌘ + D',      description: '선택 노트 복제',           group: 'edit' },
  { keys: 'Ctrl/⌘ + C',      description: '선택 노트 복사',           group: 'edit' },
  { keys: 'Ctrl/⌘ + V',      description: '붙여넣기',                 group: 'edit' },
  { keys: 'Ctrl/⌘ + Z',      description: '실행 취소',                group: 'edit' },
  { keys: 'Ctrl/⌘ + Shift + Z', description: '다시 실행',             group: 'edit' },
  { keys: 'Q',               description: 'Quantize',                 group: 'edit' },
  { keys: 'H',               description: 'Humanize',                 group: 'edit' },
  { keys: '↑ / ↓',           description: '선택 노트 반음 이동',      group: 'move' },
  { keys: 'Shift + ↑ / ↓',   description: '선택 노트 옥타브 이동',    group: 'move' },
  { keys: '← / →',           description: '선택 노트 한 grid 이동',   group: 'move' },
  { keys: 'Shift + ← / →',   description: '선택 노트 길이 조절',      group: 'move' },
  { keys: 'Ctrl/⌘ + +/-',    description: '가로 줌 인/아웃',          group: 'view' },
  { keys: '?',               description: '단축키 도움말',            group: 'view' },
];

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function isMod(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

// ═══════════════════════════════════════════════════════════════════
//  Hook
//  @param onShowHelp  optional callback to open the help modal (`?` key)
// ═══════════════════════════════════════════════════════════════════
export function usePianoRollShortcuts(onShowHelp?: () => void): void {
  // Ref keeps the latest help callback without re-binding the listener.
  const helpRef = useRef(onShowHelp);
  helpRef.current = onShowHelp;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const store = useProjectStore.getState();
      const {
        isPlaying, setIsPlaying,
        setTool, deleteSelected, clearSelection,
        duplicateSelectedNotes,
        moveSelectedNotes, resizeSelectedNotes,
        quantizeSelectedNotes, humanizeSelectedNotes,
        undo, redo,
        viewport, setViewport,
        project, activeTrack, setNotes, snapTicks, playheadTick,
      } = store;

      const mod = isMod(e);
      const key = e.key;

      // ── transport ────────────────────────────────────────────
      if (key === ' ' || key === 'Spacebar') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
        return;
      }

      // ── help ────────────────────────────────────────────────
      if (key === '?' && !mod) {
        e.preventDefault();
        helpRef.current?.();
        return;
      }

      // ── tool selection (single letter, no modifier) ─────────
      if (!mod && !e.shiftKey && !e.altKey) {
        const toolMap: Record<string, PianoRollTool> = {
          p: 'draw', v: 'select', b: 'paint',
          e: 'erase', s: 'slice', c: 'stamp',
        };
        const tool = toolMap[key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          setTool(tool);
          return;
        }
      }

      // ── edit: delete ─────────────────────────────────────────
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }

      if (key === 'Escape') {
        clearSelection();
        return;
      }

      // ── undo / redo ──────────────────────────────────────────
      if (mod && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && (key === 'y' || key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }

      // ── select all ───────────────────────────────────────────
      if (mod && (key === 'a' || key === 'A')) {
        e.preventDefault();
        const track = activeTrack();
        if (track) {
          setNotes(track.id, track.notes.map((n) => ({ ...n, selected: true })));
        }
        return;
      }

      // ── duplicate ────────────────────────────────────────────
      if (mod && (key === 'd' || key === 'D')) {
        e.preventDefault();
        duplicateSelectedNotes();
        return;
      }

      // ── copy / paste ─────────────────────────────────────────
      if (mod && (key === 'c' || key === 'C')) {
        e.preventDefault();
        const track = activeTrack();
        if (!track) return;
        const selected = track.notes.filter((n) => n.selected);
        if (selected.length === 0) return;
        const origin = Math.min(...selected.map((n) => n.startTick));
        clipboard = selected.map<ClipboardEntry>((n) => ({
          pitch: n.pitch,
          startOffset: n.startTick - origin,
          durationTicks: n.durationTicks,
          velocity: n.velocity,
          muted: n.muted,
          colorGroup: n.colorGroup,
        }));
        return;
      }

      if (mod && (key === 'v' || key === 'V')) {
        e.preventDefault();
        if (clipboard.length === 0) return;
        const track = activeTrack();
        if (!track) return;
        // Anchor at playhead, snapped to grid.
        const snap = snapTicks();
        const anchor = Math.round(playheadTick / snap) * snap;
        const newNotes: Note[] = clipboard.map((c) => ({
          id: Math.random().toString(36).slice(2, 11) + Date.now().toString(36),
          pitch: c.pitch,
          startTick: anchor + c.startOffset,
          durationTicks: c.durationTicks,
          velocity: c.velocity,
          muted: c.muted,
          colorGroup: c.colorGroup,
          selected: true,
        }));
        const cleared = track.notes.map((n) => ({ ...n, selected: false }));
        setNotes(track.id, [...cleared, ...newNotes]);
        return;
      }

      // ── transforms ───────────────────────────────────────────
      if (!mod && (key === 'q' || key === 'Q')) {
        e.preventDefault();
        const { quantizeStrength, quantizeDuration } = project.settings;
        quantizeSelectedNotes(snapTicks(), quantizeStrength ?? 1, !!quantizeDuration);
        return;
      }
      if (!mod && (key === 'h' || key === 'H')) {
        e.preventDefault();
        const { humanizeTimingTicks, humanizeVelocity } = project.settings;
        humanizeSelectedNotes(humanizeTimingTicks ?? 20, humanizeVelocity ?? 10);
        return;
      }

      // ── arrow keys: move / resize selected notes ─────────────
      const snap = snapTicks();
      if (key === 'ArrowUp') {
        e.preventDefault();
        moveSelectedNotes(e.shiftKey ? 12 : 1, 0);
        return;
      }
      if (key === 'ArrowDown') {
        e.preventDefault();
        moveSelectedNotes(e.shiftKey ? -12 : -1, 0);
        return;
      }
      if (key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) resizeSelectedNotes(-snap);
        else moveSelectedNotes(0, -snap);
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) resizeSelectedNotes(snap);
        else moveSelectedNotes(0, snap);
        return;
      }

      // ── zoom ─────────────────────────────────────────────────
      if (mod && (key === '+' || key === '=')) {
        e.preventDefault();
        setViewport({ zoomX: Math.min(8, viewport.zoomX * 1.25) });
        return;
      }
      if (mod && (key === '-' || key === '_')) {
        e.preventDefault();
        setViewport({ zoomX: Math.max(0.1, viewport.zoomX / 1.25) });
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
