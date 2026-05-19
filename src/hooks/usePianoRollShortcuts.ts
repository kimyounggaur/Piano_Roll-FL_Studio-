import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import type { Note, PianoRollTool, SnapValue } from '../types/music';
import { dispatchOpenToolDialog, quickChopNotes, type ToolDialogKind } from '../components/pianoRoll/toolsMenuModel';

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
  { keys: 'D',               description: '그리기 툴',                group: 'tool' },
  { keys: 'P',               description: '페인트 툴',                group: 'tool' },
  { keys: 'S',               description: '선택 툴',                  group: 'tool' },
  { keys: 'E',               description: '지우기 툴',                group: 'tool' },
  { keys: 'X',               description: '자르기 툴',                group: 'tool' },
  { keys: 'C',               description: '스탬프 툴',                group: 'tool' },
  { keys: 'T',               description: '음소거 툴',                group: 'tool' },
  { keys: 'M',               description: '선택 노트 음소거 토글',    group: 'edit' },
  { keys: 'Ctrl/⌘ + G',      description: 'Glue (인접 노트 병합)',    group: 'edit' },
  { keys: 'Ctrl/⌘ + L',      description: 'Quick Legato',             group: 'edit' },
  { keys: 'Ctrl/⌘ + U',      description: 'Quick Chop',               group: 'edit' },
  { keys: 'Alt + Q',         description: 'Quantize 도구 열기',       group: 'edit' },
  { keys: 'Alt + S',         description: 'Strum 도구 열기',          group: 'edit' },
  { keys: 'Alt + A',         description: 'Arpeggiate 도구 열기',     group: 'edit' },
  { keys: 'Alt + R',         description: 'Randomize 도구 열기',      group: 'edit' },
  { keys: 'Alt + O',         description: 'LFO 도구 열기',            group: 'edit' },
  { keys: 'Shift + I',       description: '선택 반전',                group: 'edit' },
  { keys: 'Z',               description: '선택 영역에 줌',           group: 'view' },
  { keys: 'Shift + 1..5',    description: '줌 프리셋',                group: 'view' },
  { keys: 'PageUp / PageDown', description: '가로 줌 단계',          group: 'view' },
  { keys: 'Home / End',      description: '맨앞 / 맨끝 스크롤',       group: 'view' },
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
  { keys: '1-7',             description: '스냅: 1/1~1/64',           group: 'view' },
  { keys: '8 / 9 / 0',      description: '스냅: 1/4T / 1/8T / 1/16T', group: 'view' },
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

function createShortcutNoteId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════
//  Hook
//  @param onShowHelp  optional callback to open the help modal (`?` key)
// ═══════════════════════════════════════════════════════════════════
export function usePianoRollShortcuts(onShowHelp?: () => void): void {
  // Ref keeps the latest help callback without re-binding the listener.
  const helpRef = useRef(onShowHelp);

  useEffect(() => {
    helpRef.current = onShowHelp;
  }, [onShowHelp]);

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
          d: 'draw', p: 'paint', s: 'select',
          e: 'erase', x: 'slice', c: 'stamp', t: 'mute',
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

      // ── FL-style tool dialogs ────────────────────────────────
      if (!mod && e.altKey) {
        const dialogMap: Record<string, ToolDialogKind> = {
          q: 'quantize',
          s: 'strum',
          a: 'arpeggiate',
          r: 'randomize',
          o: 'lfo',
        };
        const dialog = dialogMap[key.toLowerCase()];
        if (dialog) {
          e.preventDefault();
          dispatchOpenToolDialog(dialog);
          return;
        }
      }

      // ── transforms ───────────────────────────────────────────
      if (!mod && !e.altKey && (key === 'q' || key === 'Q')) {
        e.preventDefault();
        const { quantizeStrength, quantizeDuration } = project.settings;
        quantizeSelectedNotes(snapTicks(), quantizeStrength ?? 1, !!quantizeDuration);
        return;
      }
      if (!mod && !e.altKey && (key === 'h' || key === 'H')) {
        e.preventDefault();
        const { humanizeTimingTicks, humanizeVelocity } = project.settings;
        humanizeSelectedNotes(humanizeTimingTicks ?? 20, humanizeVelocity ?? 10);
        return;
      }

      // ── Glue (Ctrl+G) / Quick Legato (Ctrl+L) ─────────────
      if (mod && !e.shiftKey && (key === 'g' || key === 'G')) {
        e.preventDefault();
        useProjectStore.getState().glueSelectedNotes();
        return;
      }
      if (mod && !e.shiftKey && (key === 'l' || key === 'L')) {
        e.preventDefault();
        useProjectStore.getState().legatoSelectedNotes(0);
        return;
      }
      if (mod && !e.shiftKey && (key === 'u' || key === 'U')) {
        e.preventDefault();
        const track = activeTrack();
        if (!track) return;
        setNotes(track.id, quickChopNotes(track.notes, snapTicks(), createShortcutNoteId));
        return;
      }

      // ── Mute toggle selected (M) ────────────────────────
      if (!mod && !e.shiftKey && !e.altKey && (key === 'm' || key === 'M')) {
        e.preventDefault();
        // If ANY selected note is unmuted, mute all; otherwise unmute all.
        const tr = activeTrack();
        if (!tr) return;
        const anyUnmuted = tr.notes.some((n) => n.selected && !n.muted);
        if (anyUnmuted) useProjectStore.getState().muteSelectedNotes();
        else useProjectStore.getState().unmuteSelectedNotes();
        return;
      }

      // ── Invert Selection (Shift+I) ──────────────────────
      if (!mod && e.shiftKey && (key === 'I' || key === 'i')) {
        e.preventDefault();
        const tr = activeTrack();
        if (!tr) return;
        setNotes(tr.id, tr.notes.map((n) => ({ ...n, selected: !n.selected })));
        return;
      }

      // ── Zoom to Selection / fit-all (Z) ─────────────────
      if (!mod && !e.shiftKey && !e.altKey && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        useProjectStore.getState().zoomToSelection();
        return;
      }

      // ── Snap unit (bare digit keys 1-0, no modifier) ────
      if (!mod && !e.shiftKey && !e.altKey) {
        const snapMap: Record<string, SnapValue> = {
          '1': '1/1', '2': '1/2', '3': '1/4', '4': '1/8', '5': '1/16',
          '6': '1/32', '7': '1/64', '8': '1/4T', '9': '1/8T', '0': '1/16T',
        };
        if (snapMap[key]) {
          e.preventDefault();
          useProjectStore.getState().setSnapUnit(snapMap[key]);
          return;
        }
      }

      // ── Quick zoom presets (Shift+1..5) ─────────────────
      if (!mod && e.shiftKey && ['1','2','3','4','5','!','@','#','$','%'].includes(key)) {
        e.preventDefault();
        const preset = ({ '1':'100','2':'50','3':'25','4':'far','5':'selection',
                          '!':'100','@':'50','#':'25','$':'far','%':'selection'
        } as Record<string, '100'|'50'|'25'|'far'|'selection'>)[key];
        useProjectStore.getState().setZoomPreset(preset);
        return;
      }

      // ── PageUp / PageDown — stepped horizontal zoom ─────
      if (key === 'PageUp' || key === 'PageDown') {
        e.preventDefault();
        const factor = key === 'PageUp' ? 1.25 : 0.8;
        if (e.shiftKey) {
          setViewport({ zoomY: Math.max(0.75, Math.min(2, viewport.zoomY * factor)) });
        } else {
          setViewport({ zoomX: Math.max(0.25, Math.min(4, viewport.zoomX * factor)) });
        }
        return;
      }
      if (key === 'Home' || key === 'End') {
        e.preventDefault();
        if (key === 'Home') setViewport({ scrollX: 0 });
        else {
          const maxScrollX = Math.max(0, useProjectStore.getState().totalTicks() * viewport.pixelsPerTick - viewport.width);
          setViewport({ scrollX: maxScrollX });
        }
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
