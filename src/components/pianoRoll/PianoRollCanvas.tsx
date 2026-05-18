import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  tickToX, xToTick, pitchToY, yToPitch, clamp, rectsIntersect,
  buildNoteIndex, forEachVisibleNote, getVisibleTickRange, getVisiblePitchRange,
  type NoteIndex,
} from '../../utils/geometry';
import { snapUnitToTicks } from '../../utils/time';
import { hasNoteAt, noteCellKey, notesUnder } from '../../utils/notes';
import { NotePropertiesPopup } from './NotePropertiesPopup';
import { isBlackKey, isInScale, snapPitchToScale, buildChord } from '../../utils/musicTheory';
import type { Note, PianoRollTool } from '../../types/music';
import { NOTE_COLOR_GROUPS } from '../../types/music';

const TOTAL_KEYS = 128;
const RESIZE_HANDLE_PX = 6;
const TOOL_CURSORS: Record<PianoRollTool, string> = {
  draw: makeSvgCursor(`
    <path d="M6 21l4.2-1.2L22 8 18 4 6.2 15.8 5 20z" fill="#9fe870" stroke="#163300" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M16.5 5.5l4 4" stroke="#163300" stroke-width="1.4" stroke-linecap="round"/>
  `, 5, 21, 'crosshair'),
  paint: makeSvgCursor(`
    <path d="M7 20c2.9.4 5.4-.4 6.2-2.3.6-1.5-.1-3.1-1.6-3.7-1.7-.8-3.8.1-4.4 2.1-.4 1.2-.4 2.5-.2 3.9z" fill="#9fe870" stroke="#163300" stroke-width="1.3"/>
    <path d="M11.4 14.1L20.7 4.8c.8-.8 2.1.5 1.3 1.3l-9.1 9.4" stroke="#e8ebe6" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M11.4 14.1L20.7 4.8c.8-.8 2.1.5 1.3 1.3l-9.1 9.4" stroke="#163300" stroke-width="1.1" stroke-linecap="round"/>
  `, 7, 20, 'cell'),
  select: makeSvgCursor(`
    <path d="M6 4l12 8-5.4 1.1 3.1 5.5-2.7 1.5-3.1-5.4-3.9 3.9z" fill="#e8ebe6" stroke="#163300" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="15" y="15" width="6" height="6" fill="none" stroke="#9fe870" stroke-width="1.4"/>
  `, 6, 4, 'default'),
  erase: makeSvgCursor(`
    <path d="M5 16l8.8-8.8c.9-.9 2.3-.9 3.2 0l2.8 2.8c.9.9.9 2.3 0 3.2L12 21H7.5L5 18.5z" fill="#ffc091" stroke="#163300" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M10.6 10.4l6 6" stroke="#163300" stroke-width="1.2"/>
  `, 5, 18, 'not-allowed'),
  slice: makeSvgCursor(`
    <circle cx="8" cy="18" r="2.4" fill="none" stroke="#9fe870" stroke-width="1.5"/>
    <circle cx="16" cy="18" r="2.4" fill="none" stroke="#9fe870" stroke-width="1.5"/>
    <path d="M9.8 16.2L20 6M14.2 16.2L4 6" stroke="#e8ebe6" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 14l1.2 2.1" stroke="#9fe870" stroke-width="1.4" stroke-linecap="round"/>
  `, 12, 14, 'crosshair'),
  stamp: makeSvgCursor(`
    <path d="M13 5v11.2a3.6 3.6 0 1 1-1.7-3V5h1.7z" fill="#9fe870" stroke="#163300" stroke-width="1.2"/>
    <path d="M13 5c2.2 2.4 4.8 2.2 6.3 4.5" fill="none" stroke="#e8ebe6" stroke-width="1.6" stroke-linecap="round"/>
  `, 13, 16, 'copy'),
  mute: makeSvgCursor(`
    <path d="M5 11h4.2L15 6.8v14.4L9.2 17H5z" fill="#9fe870" stroke="#163300" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M18 10l5 5M23 10l-5 5" stroke="#ffc091" stroke-width="2" stroke-linecap="round"/>
    <path d="M18 10l5 5M23 10l-5 5" stroke="#163300" stroke-width="0.8" stroke-linecap="round"/>
  `, 15, 14, 'not-allowed'),
};

interface DragState {
  type: 'none' | 'draw' | 'move' | 'resize' | 'resize-left' | 'select-box' | 'paint' | 'paint-erase' | 'slice' | 'mute' | 'pan';
  noteId?: string;
  trackId?: string;
  startX: number;
  startY: number;
  origStartTick?: number;
  origPitch?: number;
  origDuration?: number;
  boxX2?: number;
  boxY2?: number;
  // Paint state — keys of cells already painted this drag, and ids painted so
  // they can be promoted to `selected` on mouseup.
  paintedKeys?: Set<string>;
  paintedIds?: string[];
  paintAllowOverlap?: boolean;
  // Mute drag — toggle state captured from the first note clicked, applied
  // to every subsequent note crossed during the drag.
  muteTargetValue?: boolean;
  mutedIds?: Set<string>;
  // Slice drag — tracks which cells were already sliced this drag.
  slicedTicks?: Set<number>;
}

interface Props {
  width: number;
  height: number;
}

export const PianoRollCanvas: React.FC<Props> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastPlayheadRef = useRef<number>(-1);
  const drag = useRef<DragState>({ type: 'none', startX: 0, startY: 0 });
  const {
    project, viewport, activeTool,
    addNote, removeNote, selectNote, clearSelection, selectNotesInRect, setActiveTrack,
    setViewport, snapTickValue, totalTicks,
    moveSelectedNotes, duplicateSelectedNotesInPlace,
    resizeSelectedNotes, alignSelectedNotesEndTick,
    bulkAddNotes, bulkRemoveNotes, setNotes,
    beginTransaction, commitTransaction,
    toggleNoteMuted, sliceNoteAt, sliceNotesAtTick,
    resizeSelectedNotesLeft, alignSelectedNotesStartTick,
  } = useProjectStore();

  // Drag preview — deltas in tick/pitch space + last cursor coords for tooltip.
  // null while not dragging.  Triggers a re-render (and hence canvas redraw)
  // whenever the user moves the mouse during a move-drag, so the canvas
  // reflects the in-flight move without committing it to the store every frame.
  const [movePreview, setMovePreview] = useState<
    { dT: number; dP: number; mx: number; my: number } | null
  >(null);

  // Resize preview — live drag state, committed on mouseup.
  //   dT     : per-note duration delta (used when !shift)
  //   shift  : if true, align all selected to the same end tick
  //   endTick: target end tick of the anchor note (origStartTick + origDuration + dT)
  const [resizePreview, setResizePreview] = useState<
    { dT: number; shift: boolean; endTick: number; mx: number; my: number } | null
  >(null);

  // Marquee selection — pixel-space rect plus the modifier state captured at
  // mousedown. Drives both the rectangle render and the in-flight preview
  // of which notes will be selected. Committed to the store on mouseup.
  const [selectionRect, setSelectionRect] = useState<
    { x1: number; y1: number; x2: number; y2: number; additive: boolean } | null
  >(null);
  const { settings } = project;
  const vp = viewport;

  // ── Per-track sorted index — recomputed only when a track's notes
  // identity changes. Lets the render loop binary-search to the first
  // visible note instead of iterating every note every frame.
  const noteIndexByTrack = useMemo(() => {
    const map = new Map<string, NoteIndex>();
    for (const t of project.tracks) map.set(t.id, buildNoteIndex(t.notes));
    return map;
  }, [project.tracks]);

  // Keep viewport dimensions in sync so getVisiblePitchRange / getVisibleTickRange work
  useEffect(() => {
    setViewport({ width, height });
  }, [width, height, setViewport]);

  // ── Grid drawing ───────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // ── Wise near-black canvas background ──
    ctx.fillStyle = '#090a08';
    ctx.fillRect(0, 0, width, height);

    const { ppq, timeSignature: ts, bars, scaleRoot, scaleName } = settings;
    const ticksPerBeat = ppq * (4 / ts.denominator);
    const ticksPerBar  = ticksPerBeat * ts.numerator;
    const snapTicks    = snapUnitToTicks(settings.snapUnit, ppq);

    // ── Horizontal key lane shading ──
    const firstKey = Math.floor(vp.scrollY / vp.keyHeight);
    const lastKey  = Math.min(TOTAL_KEYS - 1, Math.ceil((vp.scrollY + height) / vp.keyHeight));
    for (let i = firstKey; i <= lastKey; i++) {
      const pitch = TOTAL_KEYS - 1 - i;
      const y = i * vp.keyHeight - vp.scrollY;
      // black key rows — darker tint
      if (isBlackKey(pitch)) {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(0, y, width, vp.keyHeight);
      }
      // C-line subtle rule
      if (pitch % 12 === 0) {
        ctx.fillStyle = 'rgba(159,232,112,0.06)';  // Wise Green tint
        ctx.fillRect(0, y, width, 1);
      }
      // Non-scale rows — dim overlay
      if (scaleName !== 'none' && !isInScale(pitch, scaleRoot, scaleName)) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, y, width, vp.keyHeight);
      }
    }

    // ── Loop region — Wise Green tinted band ──
    const { loopStartTick, loopEndTick } = settings;
    if (loopEndTick > loopStartTick) {
      const lx1 = tickToX(loopStartTick, vp);
      const lx2 = tickToX(loopEndTick,   vp);
      if (lx2 > 0 && lx1 < width) {
        const x1 = Math.max(0, lx1);
        const x2 = Math.min(width, lx2);
        ctx.fillStyle = 'rgba(159,232,112,0.07)';      // Wise Green band
        ctx.fillRect(x1, 0, x2 - x1, height);
        // Edge markers
        ctx.fillStyle = 'rgba(159,232,112,0.55)';
        if (lx1 >= 0 && lx1 < width) ctx.fillRect(lx1, 0, 1.5, height);
        if (lx2 >= 0 && lx2 < width) ctx.fillRect(lx2 - 1.5, 0, 1.5, height);
      }
    }

    // ── Vertical time grid — Wise subtle lines ──
    const startTick = Math.floor(vp.scrollX / vp.pixelsPerTick / snapTicks) * snapTicks;
    const endTick   = Math.ceil((vp.scrollX + width) / vp.pixelsPerTick);
    for (let t = startTick; t <= Math.min(endTick, totalTicks()); t += snapTicks) {
      const x = tickToX(t, vp);
      if (x < 0 || x > width) continue;
      const isBar  = t % ticksPerBar  === 0;
      const isBeat = t % ticksPerBeat === 0;
      ctx.strokeStyle = isBar
        ? 'rgba(232,235,230,0.20)'
        : isBeat
          ? 'rgba(232,235,230,0.08)'
          : 'rgba(232,235,230,0.035)';
      ctx.lineWidth = isBar ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    // ── Bar numbers — Wise weight-900 style ──
    ctx.fillStyle = 'rgba(159,232,112,0.45)';  // Wise Green tint
    ctx.font = '900 10px Inter, sans-serif';
    ctx.font = 'bold 10px sans-serif';
    for (let b = 0; b <= bars; b++) {
      const t = b * ticksPerBar;
      const x = tickToX(t, vp);
      if (x >= 0 && x < width) ctx.fillText(String(b + 1), x + 3, 12);
    }

    // ── Visible tick / pitch ranges (used for ghost + active iteration) ──
    const vTicks  = getVisibleTickRange({ ...vp, width });
    const vPitch  = getVisiblePitchRange({ ...vp, height });

    // ── Ghost notes — Wise muted overlay ──
    if (settings.ghostNotesVisible) {
      const soloActive = project.tracks.some((tr) => tr.solo);
      for (const track of project.tracks) {
        if (track.id === project.activeTrackId) continue;
        const hidden = track.muted || (soloActive && !track.solo);
        if (hidden) continue;
        const idx = noteIndexByTrack.get(track.id);
        if (!idx) continue;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = track.color;
        forEachVisibleNote(idx, vTicks.startTick, vTicks.endTick, vPitch.minPitch, vPitch.maxPitch, (note) => {
          if (note.muted) return;
          const x = tickToX(note.startTick, vp);
          const w = note.durationTicks * vp.pixelsPerTick;
          const y = pitchToY(note.pitch, vp);
          ctx.fillRect(x, y + 1, Math.max(2, w - 1), vp.keyHeight - 2);
        });
        ctx.globalAlpha = 1;
      }
    }

    // ── Active track notes — Wise Green notes ──
    const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId);
    if (activeTrack) {
      const idx = noteIndexByTrack.get(activeTrack.id);
      // During an in-flight move, selected notes may shift past the visible
      // range; widen pitch bounds by |dP| so they don't pop out.
      const dPMax = movePreview ? Math.abs(movePreview.dP) : 0;
      const dTMax = movePreview ? Math.abs(movePreview.dT) : 0;
      const visibleStart = vTicks.startTick - dTMax;
      const visibleEnd   = vTicks.endTick   + dTMax;
      const visiblePMin  = vPitch.minPitch  - dPMax;
      const visiblePMax  = vPitch.maxPitch  + dPMax;
      const drawNote = (note: typeof activeTrack.notes[number]) => {
        // Apply in-flight drag preview offset to selected notes
        const dT = note.selected && movePreview ? movePreview.dT : 0;
        const dP = note.selected && movePreview ? movePreview.dP : 0;

        // Resize preview — selected notes get either a duration delta or
        // an aligned end tick (Shift mode). Minimum duration enforced visually.
        let previewDur = note.durationTicks;
        if (note.selected && resizePreview) {
          const minDur = snapUnitToTicks(settings.snapUnit, settings.ppq);
          previewDur = resizePreview.shift
            ? Math.max(minDur, resizePreview.endTick - note.startTick)
            : Math.max(minDur, note.durationTicks + resizePreview.dT);
        }

        const x = tickToX(note.startTick + dT, vp);
        const w = previewDur * vp.pixelsPerTick;
        const y = pitchToY(note.pitch + dP, vp);
        if (x + w < 0 || x > width) return;
        const nw = Math.max(3, w - 1);
        const nh = vp.keyHeight - 2;

        // Note body — selection > muted > colorGroup > track colour
        const groupColor = (() => {
          const gIdx = note.colorGroup ? parseInt(note.colorGroup, 10) : 0;
          if (!Number.isFinite(gIdx) || gIdx <= 0 || gIdx >= NOTE_COLOR_GROUPS.length) return null;
          return NOTE_COLOR_GROUPS[gIdx] || null;
        })();
        const baseColor = note.selected
          ? '#ffd11a'
          : (groupColor ?? activeTrack.color);
        ctx.globalAlpha = note.muted ? 0.35 : 1;
        ctx.fillStyle = baseColor;
        ctx.fillRect(x, y + 1, nw, nh);

        // Wise: subtle lighter top-edge highlight
        ctx.fillStyle = note.selected
          ? 'rgba(255,255,255,0.4)'
          : 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y + 1, nw, 2);

        // Wise: dark green label on note (for selected notes)
        if (note.selected && nw > 14) {
          ctx.fillStyle = '#163300';
          ctx.font = 'bold 8px sans-serif';
          ctx.fillText('✓', x + 3, y + nh - 3);
        }

        // Resize handle — Wise ring style
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + nw - 3, y + 2, 3, nh - 4);
      };
      if (idx) {
        forEachVisibleNote(idx, visibleStart, visibleEnd, visiblePMin, visiblePMax, drawNote);
      }
      ctx.globalAlpha = 1; // restore in case last note was muted
    }

    // Playhead is drawn on a separate overlay canvas via rAF (see drawPlayhead).

    // ── Marquee selection box + in-flight intersection preview ──────────
    if (selectionRect) {
      const bx = Math.min(selectionRect.x1, selectionRect.x2);
      const by = Math.min(selectionRect.y1, selectionRect.y2);
      const bw = Math.abs(selectionRect.x2 - selectionRect.x1);
      const bh = Math.abs(selectionRect.y2 - selectionRect.y1);

      // Yellow outline on every active-track note that intersects the rect.
      // This is the live preview — actual `selected` state is updated on mouseup.
      if (activeTrack) {
        const marqueeRect = { x: bx, y: by, w: bw, h: bh };
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffd11a';
        for (const note of activeTrack.notes) {
          const nx = tickToX(note.startTick, vp);
          const nw = Math.max(3, note.durationTicks * vp.pixelsPerTick - 1);
          const ny = pitchToY(note.pitch, vp);
          const nh = vp.keyHeight - 2;
          const noteRect = { x: nx, y: ny + 1, w: nw, h: nh };
          if (rectsIntersect(noteRect, marqueeRect)) {
            ctx.strokeRect(noteRect.x - 0.5, noteRect.y - 0.5, noteRect.w + 1, noteRect.h + 1);
          }
        }
      }

      // The rectangle itself — Wise Warning Yellow dashed border + tinted fill
      ctx.strokeStyle = '#ffd11a';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(255,209,26,0.07)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.setLineDash([]);
    }
  }, [width, height, vp, project, settings, totalTicks, movePreview, resizePreview, selectionRect, noteIndexByTrack]);

  useEffect(() => { draw(); });

  // ── Playhead overlay — drawn on its own canvas via requestAnimationFrame ──
  // The main canvas does NOT redraw on every playhead tick; only this overlay does.
  const drawPlayhead = useCallback(() => {
    const canvas = playheadCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width  = width  * dpr;
      canvas.height = height * dpr;
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, width, height);

    const { playheadTick } = useProjectStore.getState();
    const px = tickToX(playheadTick, vp);
    if (px >= 0 && px < width) {
      ctx.strokeStyle = '#d03238';   // Wise Danger Red
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height); ctx.stroke();
      // Triangle head
      ctx.fillStyle = '#d03238';
      ctx.beginPath();
      ctx.moveTo(px - 4, 0); ctx.lineTo(px + 4, 0); ctx.lineTo(px, 6);
      ctx.closePath(); ctx.fill();
    }
  }, [vp, width, height]);

  useEffect(() => {
    const tick = () => {
      const ph = useProjectStore.getState().playheadTick;
      if (ph !== lastPlayheadRef.current) {
        lastPlayheadRef.current = ph;
        drawPlayhead();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    drawPlayhead();  // initial paint
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawPlayhead]);

  // ── Hit testing ────────────────────────────────────────────────────
  //   isResize     → cursor is on the RIGHT handle (existing behaviour)
  //   isResizeLeft → cursor is on the LEFT handle  (#39)
  const hitTest = useCallback(
    (cx: number, cy: number): { note: Note; trackId: string; isResize: boolean; isResizeLeft: boolean } | null => {
      const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId);
      if (!activeTrack) return null;
      // Reverse so top-drawn note hits first
      for (let i = activeTrack.notes.length - 1; i >= 0; i--) {
        const note = activeTrack.notes[i];
        const nx = tickToX(note.startTick, vp);
        const nw = Math.max(3, note.durationTicks * vp.pixelsPerTick - 1);
        const ny = pitchToY(note.pitch, vp);
        const nh = vp.keyHeight - 2;
        if (cx >= nx && cx <= nx + nw && cy >= ny + 1 && cy <= ny + nh) {
          // For very short notes, prefer right-resize over left-resize so
          // duration can still be dragged.
          const isResize = nw > 2 * RESIZE_HANDLE_PX && cx >= nx + nw - RESIZE_HANDLE_PX;
          const isResizeLeft = nw > 2 * RESIZE_HANDLE_PX && cx <= nx + RESIZE_HANDLE_PX && !isResize;
          return { note, trackId: activeTrack.id, isResize, isResizeLeft };
        }
      }
      return null;
    },
    [project, vp]
  );

  // ── Mouse handlers ─────────────────────────────────────────────────
  const getCursorPos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
    },
    []
  );

  // ── Note Properties popup (active-track double-click) ─────────────
  const [propsPopup, setPropsPopup] = useState<{ noteId: string; trackId: string; x: number; y: number } | null>(null);

  // Double-click — active note opens properties; ghost note activates track.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { cx, cy } = getCursorPos(e);
      const hit = hitTest(cx, cy);
      if (hit) {
        setPropsPopup({
          noteId: hit.note.id,
          trackId: hit.trackId,
          x: e.clientX + 12,
          y: e.clientY + 12,
        });
        return;
      }
      if (!settings.ghostDoubleClickActivates || !settings.ghostNotesVisible) return;
      const soloActive = project.tracks.some((tr) => tr.solo);
      const visibleGhostTracks = project.tracks
        .filter((t) => t.id !== project.activeTrackId
          && !t.muted
          && (!soloActive || t.solo));
      for (const tr of visibleGhostTracks) {
        for (let i = tr.notes.length - 1; i >= 0; i--) {
          const n = tr.notes[i];
          if (n.muted) continue;
          const nx = tickToX(n.startTick, vp);
          const nw = Math.max(3, n.durationTicks * vp.pixelsPerTick - 1);
          const ny = pitchToY(n.pitch, vp);
          const nh = vp.keyHeight - 2;
          if (cx >= nx && cx <= nx + nw && cy >= ny + 1 && cy <= ny + nh) {
            setActiveTrack(tr.id);
            return;
          }
        }
      }
    },
    [settings.ghostDoubleClickActivates, settings.ghostNotesVisible, project, vp, getCursorPos, setActiveTrack, hitTest],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { cx, cy } = getCursorPos(e);
      const hit = hitTest(cx, cy);
      const rawTick = xToTick(cx, vp);
      const snappedTick = snapTickValue(rawTick);
      const pitch = yToPitch(cy, vp);
      const activeTrackId = project.activeTrackId ?? '';
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;

      // ── Middle-mouse pan (#55) — start drag-to-pan regardless of tool ──
      if (e.button === 1) {
        e.preventDefault();
        drag.current = {
          type: 'pan',
          startX: cx, startY: cy,
          origStartTick: vp.scrollX,
          origPitch: vp.scrollY,
        };
        return;
      }

      // ── Paint tool: left = paint drag, right = erase drag ────────────
      if (activeTool === 'paint') {
        if (!activeTrackId) return;
        const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
        const cellTick = Math.max(0, Math.floor(rawTick / snapTicks) * snapTicks);
        const cellPitch = clamp(pitch, 0, 127);
        const activeTrack = project.tracks.find((t) => t.id === activeTrackId);
        beginTransaction();

        if (e.button === 2) {
          // Right-drag erase — remove every note covering this cell.
          drag.current = {
            type: 'paint-erase',
            startX: cx, startY: cy,
            paintedKeys: new Set(),
            paintedIds: [],
          };
          if (activeTrack) {
            const targets = notesUnder(activeTrack.notes, cellTick, cellPitch);
            if (targets.length) bulkRemoveNotes(activeTrackId, targets.map((n) => n.id));
          }
          return;
        }

        // Left-drag paint
        const allowOverlap = e.shiftKey;
        const paintedKeys = new Set<string>();
        const paintedIds: string[] = [];
        const key = noteCellKey(cellTick, cellPitch);
        const collides = !allowOverlap && activeTrack && hasNoteAt(activeTrack.notes, cellTick, cellPitch);
        if (!collides && cellTick < totalTicks()) {
          const ids = bulkAddNotes(activeTrackId, [{
            pitch: cellPitch, startTick: cellTick, durationTicks: snapTicks,
            velocity: 100,
          }]);
          paintedKeys.add(key);
          paintedIds.push(...ids);
        }
        drag.current = {
          type: 'paint',
          startX: cx, startY: cy,
          paintedKeys, paintedIds,
          paintAllowOverlap: allowOverlap,
        };
        return;
      }

      // ── Slice tool — single click splits, Shift+drag slices everything ──
      if (activeTool === 'slice') {
        if (!activeTrackId) return;
        const unsnap = e.altKey || e.ctrlKey || e.metaKey;
        const sliceTick = unsnap ? Math.round(rawTick) : snappedTick;
        beginTransaction();
        if (e.shiftKey) {
          // Drum-style multi-slice — slice every note crossing this tick.
          sliceNotesAtTick(activeTrackId, sliceTick);
          drag.current = {
            type: 'slice', startX: cx, startY: cy,
            slicedTicks: new Set([sliceTick]),
          };
        } else if (hit) {
          sliceNoteAt(hit.trackId, hit.note.id, sliceTick);
          drag.current = { type: 'slice', startX: cx, startY: cy, slicedTicks: new Set([sliceTick]) };
        } else {
          drag.current = { type: 'slice', startX: cx, startY: cy, slicedTicks: new Set() };
        }
        return;
      }

      // ── Mute tool — click/drag toggles note.muted ─────────────────────
      if (activeTool === 'mute') {
        if (!hit) return;
        beginTransaction();
        const newMuted = !hit.note.muted;
        toggleNoteMuted(hit.trackId, hit.note.id, newMuted);
        drag.current = {
          type: 'mute', startX: cx, startY: cy,
          muteTargetValue: newMuted,
          mutedIds: new Set([hit.note.id]),
        };
        return;
      }

      // ── Right-click anywhere → delete note under cursor (no-op on empty) ──
      if (e.button === 2) {
        if (hit) removeNote(hit.trackId, hit.note.id);
        return;
      }

      if (activeTool === 'erase') {
        if (hit) removeNote(hit.trackId, hit.note.id);
        return;
      }

      if (activeTool === 'select') {
        if (hit) {
          if (hit.isResize) {
            if (!hit.note.selected) {
              selectNote(hit.trackId, hit.note.id, additive);
            }
            drag.current = {
              type: 'resize',
              noteId: hit.note.id,
              trackId: hit.trackId,
              startX: cx, startY: cy,
              origStartTick: hit.note.startTick,
              origDuration: hit.note.durationTicks,
            };
            return;
          }
          if (hit.isResizeLeft) {
            if (!hit.note.selected) {
              selectNote(hit.trackId, hit.note.id, additive);
            }
            drag.current = {
              type: 'resize-left',
              noteId: hit.note.id,
              trackId: hit.trackId,
              startX: cx, startY: cy,
              origStartTick: hit.note.startTick,
              origDuration: hit.note.durationTicks,
            };
            return;
          }

          // Ensure the clicked note is part of the selection.  If it was
          // already selected, leave the existing multi-selection intact so
          // dragging moves the whole group.
          if (!hit.note.selected) {
            selectNote(hit.trackId, hit.note.id, additive);
          }
          // Alt-drag OR Shift-drag-on-already-selected: clone in place.
          // (Plain Shift+click that JUST changed selection is additive-select
          //  and should NOT clone — only clone when the note was already in
          //  the selection, matching FL's Shift-drag-to-copy gesture.)
          const wasAlreadySelected = hit.note.selected;
          if (e.altKey || (e.shiftKey && wasAlreadySelected)) {
            duplicateSelectedNotesInPlace();
          }
          drag.current = {
            type: 'move',
            noteId: hit.note.id,
            trackId: hit.trackId,
            startX: cx, startY: cy,
            origStartTick: hit.note.startTick,
            origPitch: hit.note.pitch,
            origDuration: hit.note.durationTicks,
          };
        } else {
          // Begin marquee. Defer the "clear existing selection" step to
          // mouseup commit so the preview can still highlight overlaps,
          // and so a zero-distance click doesn't clobber selection unless
          // the user actually drags.
          drag.current = { type: 'select-box', startX: cx, startY: cy, boxX2: cx, boxY2: cy };
          setSelectionRect({ x1: cx, y1: cy, x2: cx, y2: cy, additive });
        }
        return;
      }

      // ── Stamp tool ───────────────────────────────────────────────────
      if (activeTool === 'stamp') {
        if (!activeTrackId) return;
        const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
        const dur = settings.stampDurationTicks > 0 ? settings.stampDurationTicks : snapTicks;
        const rootPitch = clamp(pitch, 0, 127);
        const chordPitches = buildChord(rootPitch, settings.stampChordType, {
          scaleSnap: settings.scaleSnapEnabled,
          scaleRoot: settings.scaleRoot,
          scaleName: settings.scaleName,
        });
        if (!additive) clearSelection();
        for (const cp of chordPitches) {
          if (snappedTick >= 0 && snappedTick < totalTicks()) {
            addNote(activeTrackId, {
              pitch: cp,
              startTick: snappedTick,
              durationTicks: dur,
              velocity: 100,
              selected: true,
            });
          }
        }
        if (!settings.stampHoldTool) {
          useProjectStore.getState().setTool('draw');
        }
        drag.current = { type: 'none', startX: 0, startY: 0 };
        return;
      }

      // draw tool
      if (hit) {
        if (hit.isResize) {
          if (!hit.note.selected) {
            selectNote(hit.trackId, hit.note.id, additive);
          }
          drag.current = {
            type: 'resize',
            noteId: hit.note.id,
            trackId: hit.trackId,
            startX: cx, startY: cy,
            origStartTick: hit.note.startTick,
            origDuration: hit.note.durationTicks,
          };
        } else if (hit.isResizeLeft) {
          if (!hit.note.selected) {
            selectNote(hit.trackId, hit.note.id, additive);
          }
          drag.current = {
            type: 'resize-left',
            noteId: hit.note.id,
            trackId: hit.trackId,
            startX: cx, startY: cy,
            origStartTick: hit.note.startTick,
            origDuration: hit.note.durationTicks,
          };
        } else {
          // clicking existing note on draw tool → select + start move
          if (!hit.note.selected) {
            selectNote(hit.trackId, hit.note.id, additive);
          }
          if (e.altKey) duplicateSelectedNotesInPlace();
          drag.current = {
            type: 'move',
            noteId: hit.note.id,
            trackId: hit.trackId,
            startX: cx, startY: cy,
            origStartTick: hit.note.startTick,
            origPitch: hit.note.pitch,
            origDuration: hit.note.durationTicks,
          };
        }
      } else {
        // empty area on draw tool → deselect first (unless additive), then add note
        if (!additive) clearSelection();
        const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
        const scaleOn = settings.scaleSnapEnabled && settings.scaleName !== 'none';
        const finalPitch = scaleOn
          ? snapPitchToScale(pitch, settings.scaleRoot, settings.scaleName, 'nearest')
          : clamp(pitch, 0, 127);
        if (activeTrackId && snappedTick >= 0 && snappedTick < totalTicks() && finalPitch >= 0) {
          addNote(activeTrackId, {
            pitch: finalPitch,
            startTick: snappedTick,
            durationTicks: snapTicks,
            velocity: 100,
          });
        }
        drag.current = { type: 'draw', startX: cx, startY: cy };
      }
    },
    [activeTool, vp, hitTest, snapTickValue, project, settings, totalTicks, addNote, removeNote, selectNote, clearSelection, duplicateSelectedNotesInPlace, getCursorPos,
     bulkAddNotes, bulkRemoveNotes, beginTransaction]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { cx, cy } = getCursorPos(e);
      const d = drag.current;
      if (d.type === 'none') return;

      if (d.type === 'select-box') {
        drag.current = { ...d, boxX2: cx, boxY2: cy };
        setSelectionRect((prev) => prev ? { ...prev, x2: cx, y2: cy } : prev);
        return;
      }

      if (d.type === 'pan') {
        const dx = cx - d.startX;
        const dy = cy - d.startY;
        setViewport({
          scrollX: Math.max(0, (d.origStartTick ?? 0) - dx),
          scrollY: Math.max(0, (d.origPitch ?? 0) - dy),
        });
        return;
      }

      if (d.type === 'paint') {
        const activeTrackId = project.activeTrackId ?? '';
        if (!activeTrackId) return;
        const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
        const rawTick = xToTick(cx, vp);
        const cellTick = Math.max(0, Math.floor(rawTick / snapTicks) * snapTicks);
        const cellPitch = clamp(yToPitch(cy, vp), 0, 127);
        if (cellTick >= totalTicks()) return;
        const key = noteCellKey(cellTick, cellPitch);
        if (d.paintedKeys!.has(key)) return;
        if (!d.paintAllowOverlap) {
          // Re-read the latest active-track notes so we don't collide with
          // notes just painted by an earlier mousemove tick.
          const at = useProjectStore.getState().activeTrack();
          if (at && hasNoteAt(at.notes, cellTick, cellPitch)) {
            d.paintedKeys!.add(key); // remember so we don't keep retrying
            return;
          }
        }
        const ids = bulkAddNotes(activeTrackId, [{
          pitch: cellPitch, startTick: cellTick, durationTicks: snapTicks,
          velocity: 100,
        }]);
        d.paintedKeys!.add(key);
        d.paintedIds!.push(...ids);
        return;
      }

      if (d.type === 'paint-erase') {
        const activeTrackId = project.activeTrackId ?? '';
        if (!activeTrackId) return;
        const rawTick = xToTick(cx, vp);
        const cellPitch = clamp(yToPitch(cy, vp), 0, 127);
        const at = useProjectStore.getState().activeTrack();
        if (!at) return;
        const targets = notesUnder(at.notes, rawTick, cellPitch);
        if (targets.length) bulkRemoveNotes(activeTrackId, targets.map((n) => n.id));
        return;
      }

      if (d.type === 'move' && d.noteId && d.trackId) {
        // Ctrl/Cmd held → bypass snap; otherwise snap to grid
        const unsnap = e.ctrlKey || e.metaKey;
        const dx = cx - d.startX;
        const dy = cy - d.startY;
        const rawDeltaTick = dx / vp.pixelsPerTick;
        const deltaTick = unsnap
          ? Math.round(rawDeltaTick)
          : snapTickValue(d.origStartTick! + rawDeltaTick) - d.origStartTick!;
        const deltaPitch = -Math.round(dy / vp.keyHeight);

        // Clamp so the anchor note can't go past 0 or 127
        const clampedDeltaTick  = Math.max(-d.origStartTick!, deltaTick);
        const clampedDeltaPitch = clamp(deltaPitch, -d.origPitch!, 127 - d.origPitch!);

        // Local preview only — committed on mouseup
        setMovePreview({ dT: clampedDeltaTick, dP: clampedDeltaPitch, mx: cx, my: cy });
        return;
      }

      if (d.type === 'resize' && d.noteId && d.trackId) {
        const dx = cx - d.startX;
        const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
        // Ctrl/Cmd → bypass snap (matches move behavior)
        const unsnap = e.ctrlKey || e.metaKey;
        const rawEndTick = d.origStartTick! + d.origDuration! + (dx / vp.pixelsPerTick);
        const snappedEnd = unsnap
          ? Math.round(rawEndTick)
          : snapTickValue(rawEndTick);
        // Clamp end so anchor note can't go below its minimum duration
        const minEnd = d.origStartTick! + snapTicks;
        const endTick = Math.max(minEnd, snappedEnd);
        const dT = endTick - (d.origStartTick! + d.origDuration!);

        setResizePreview({ dT, shift: e.shiftKey, endTick, mx: cx, my: cy });
      }

      // ── Left-resize drag — store delta as negative duration change so we
      // can reuse the existing tooltip / preview while shift means align-start.
      if (d.type === 'resize-left' && d.noteId && d.trackId) {
        const dx = cx - d.startX;
        const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
        const unsnap = e.ctrlKey || e.metaKey;
        const rawStart = d.origStartTick! + (dx / vp.pixelsPerTick);
        const snappedStart = unsnap ? Math.round(rawStart) : snapTickValue(rawStart);
        const maxStart = d.origStartTick! + d.origDuration! - snapTicks;
        const startTick = Math.min(maxStart, Math.max(0, snappedStart));
        const dT = startTick - d.origStartTick!;
        setResizePreview({ dT, shift: e.shiftKey, endTick: startTick, mx: cx, my: cy });
      }

      // ── Slice drag — slice every unique snapped tick crossed once. ──
      if (d.type === 'slice') {
        const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
        const unsnap = e.altKey || e.ctrlKey || e.metaKey;
        const rawTick = xToTick(cx, vp);
        const sliceTick = unsnap ? Math.round(rawTick) : Math.round(rawTick / snapTicks) * snapTicks;
        const activeTrackId = project.activeTrackId ?? '';
        if (!activeTrackId) return;
        if (!d.slicedTicks!.has(sliceTick)) {
          d.slicedTicks!.add(sliceTick);
          if (e.shiftKey) {
            sliceNotesAtTick(activeTrackId, sliceTick);
          } else {
            const at = useProjectStore.getState().activeTrack();
            if (at) {
              for (const n of at.notes) {
                if (n.startTick < sliceTick && n.startTick + n.durationTicks > sliceTick) {
                  sliceNoteAt(activeTrackId, n.id, sliceTick);
                  break;
                }
              }
            }
          }
        }
        return;
      }

      // ── Mute drag — apply captured target value to every note crossed.
      if (d.type === 'mute') {
        const at = useProjectStore.getState().activeTrack();
        if (!at) return;
        for (const n of at.notes) {
          const nx = tickToX(n.startTick, vp);
          const nw = Math.max(3, n.durationTicks * vp.pixelsPerTick - 1);
          const ny = pitchToY(n.pitch, vp);
          const nh = vp.keyHeight - 2;
          const hit = cx >= nx && cx <= nx + nw && cy >= ny + 1 && cy <= ny + nh;
          if (hit && !d.mutedIds!.has(n.id)) {
            d.mutedIds!.add(n.id);
            toggleNoteMuted(at.id, n.id, d.muteTargetValue);
          }
        }
        return;
      }
    },
    [vp, settings, snapTickValue, getCursorPos, project,
     totalTicks, bulkAddNotes, bulkRemoveNotes]
  );

  const handleMouseUp = useCallback(
    () => {
      const d = drag.current;

      // ── Paint: promote painted notes to `selected`, then commit txn ──
      if (d.type === 'paint' || d.type === 'paint-erase') {
        if (d.type === 'paint' && d.paintedIds && d.paintedIds.length > 0) {
          const at = useProjectStore.getState().activeTrack();
          if (at) {
            const painted = new Set(d.paintedIds);
            setNotes(at.id, at.notes.map((n) => ({ ...n, selected: painted.has(n.id) })));
          }
        }
        commitTransaction();
        drag.current = { type: 'none', startX: 0, startY: 0 };
        return;
      }

      // Commit move preview (if any) atomically
      if (d.type === 'move' && movePreview && (movePreview.dT !== 0 || movePreview.dP !== 0)) {
        moveSelectedNotes(movePreview.dP, movePreview.dT);
      }
      if (movePreview) setMovePreview(null);

      // Commit resize preview
      if (d.type === 'resize' && resizePreview) {
        if (resizePreview.shift) {
          alignSelectedNotesEndTick(resizePreview.endTick);
        } else if (resizePreview.dT !== 0) {
          resizeSelectedNotes(resizePreview.dT);
        }
      }
      // Commit left-resize preview
      if (d.type === 'resize-left' && resizePreview) {
        if (resizePreview.shift) {
          alignSelectedNotesStartTick(resizePreview.endTick);
        } else if (resizePreview.dT !== 0) {
          resizeSelectedNotesLeft(resizePreview.dT);
        }
      }
      if (resizePreview) setResizePreview(null);

      // ── Slice / Mute — already applied incrementally during drag, just
      // commit the transaction so we get a single undo entry.
      if (d.type === 'slice' || d.type === 'mute') {
        commitTransaction();
        drag.current = { type: 'none', startX: 0, startY: 0 };
        return;
      }
      if (d.type === 'select-box' && selectionRect) {
        const { x1: sx1, y1: sy1, x2: sx2, y2: sy2, additive: rectAdditive } = selectionRect;
        const dragged = Math.abs(sx2 - sx1) > 2 || Math.abs(sy2 - sy1) > 2;
        if (dragged) {
          // Convert pixel rect → tick/pitch rect (tick grows with x; pitch grows upward).
          const t1 = Math.min(xToTick(sx1, vp), xToTick(sx2, vp));
          const t2 = Math.max(xToTick(sx1, vp), xToTick(sx2, vp));
          const p1 = yToPitch(sy1, vp);
          const p2 = yToPitch(sy2, vp);
          selectNotesInRect(
            { startTick: t1, endTick: t2, minPitch: Math.min(p1, p2), maxPitch: Math.max(p1, p2) },
            rectAdditive,
          );
        } else if (!rectAdditive) {
          // Plain click on empty space (no drag, no modifier) → clear selection
          clearSelection();
        }
        setSelectionRect(null);
      }
      drag.current = { type: 'none', startX: 0, startY: 0 };
    },
    [vp, movePreview, moveSelectedNotes,
     resizePreview, resizeSelectedNotes, alignSelectedNotesEndTick,
     selectionRect, selectNotesInRect, clearSelection,
     setNotes, commitTransaction]
  );

  // Scroll with mouse wheel
  //   Ctrl/Cmd + wheel  → zoom horizontal (zoomX 0.25..4)
  //   Alt + wheel       → zoom vertical   (zoomY 0.75..2)
  //   Shift + wheel     → horizontal scroll
  //   (no modifier)     → vertical scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      // ── Alt+wheel on a note → velocity ±1 (Shift+Alt: ±10) ─────────────
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const { cx, cy } = getCursorPos(e as unknown as React.MouseEvent<HTMLCanvasElement>);
        const hit = hitTest(cx, cy);
        if (hit) {
          const step = (e.shiftKey ? 10 : 1) * (e.deltaY < 0 ? 1 : -1);
          const at = useProjectStore.getState().activeTrack();
          if (!at) return;
          // If hit note is selected, scale every selected note; otherwise just hit.
          const targets = hit.note.selected ? at.notes.filter((n) => n.selected) : [hit.note];
          for (const n of targets) {
            const v = Math.max(1, Math.min(127, (n.velocity ?? 100) + step));
            useProjectStore.getState().updateNote(at.id, n.id, { velocity: v });
          }
          return;
        }
        // No note under cursor — fall through to zoom-Y as before.
      }
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const nextZoomX = clamp(vp.zoomX * factor, 0.25, 4);
        setViewport({ zoomX: nextZoomX });
        return;
      }
      if (e.altKey) {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const nextZoomY = clamp(vp.zoomY * factor, 0.75, 2);
        setViewport({ zoomY: nextZoomY });
        return;
      }
      if (e.shiftKey) {
        // Horizontal scroll
        const maxScrollX = Math.max(0, totalTicks() * vp.pixelsPerTick - width);
        setViewport({ scrollX: clamp(vp.scrollX + e.deltaY, 0, maxScrollX) });
        return;
      }
      // Vertical scroll
      const maxScrollY = Math.max(0, TOTAL_KEYS * vp.keyHeight - height);
      setViewport({ scrollY: clamp(vp.scrollY + e.deltaY, 0, maxScrollY) });
    },
    [vp, width, height, setViewport, totalTicks]
  );

  // ── Auto-follow playhead during playback ─────────────────────────
  // Keeps the playhead in the right third of the viewport; when it scrolls
  // past, jump scrollX so it lands at the left edge of that band.
  const isPlaying          = useProjectStore((s) => s.isPlaying);
  const autoFollow         = useProjectStore((s) => s.autoFollowPlayhead);
  useEffect(() => {
    if (!isPlaying || !autoFollow) return;
    let id = 0;
    const tick = () => {
      const { playheadTick, viewport } = useProjectStore.getState();
      const px = playheadTick * viewport.pixelsPerTick - viewport.scrollX;
      if (px < 0 || px > width) {
        const newScrollX = Math.max(0, playheadTick * viewport.pixelsPerTick - width * 0.1);
        setViewport({ scrollX: newScrollX });
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [isPlaying, autoFollow, width, setViewport]);

  const getCursor = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { cx, cy } = getCursorPos(e);
      const hit = hitTest(cx, cy);
      if (hit?.isResize) return 'ew-resize';
      if (hit && (activeTool === 'draw' || activeTool === 'select')) return 'grab';
      return TOOL_CURSORS[activeTool];
    },
    [activeTool, hitTest, getCursorPos]
  );

  const [cursor, setCursor] = useState(TOOL_CURSORS.draw);
  useEffect(() => {
    setCursor(TOOL_CURSORS[activeTool]);
  }, [activeTool]);

  const handleMouseMoveCursor = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setCursor(getCursor(e));
      handleMouseMove(e);
    },
    [getCursor, handleMouseMove]
  );

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, cursor, display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveCursor}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <canvas
        ref={playheadCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      />
      {movePreview && (movePreview.dT !== 0 || movePreview.dP !== 0) && (
        <div
          style={{
            position: 'absolute',
            left: clamp(movePreview.mx + 12, 0, Math.max(0, width - 140)),
            top:  clamp(movePreview.my + 12, 0, Math.max(0, height - 28)),
            pointerEvents: 'none',
            background: 'rgba(14,15,12,0.92)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
          }}
        >
          {formatMoveDelta(movePreview.dT, movePreview.dP, settings.ppq)}
        </div>
      )}
      {resizePreview && (
        <div
          style={{
            position: 'absolute',
            left: clamp(resizePreview.mx + 12, 0, Math.max(0, width - 160)),
            top:  clamp(resizePreview.my + 12, 0, Math.max(0, height - 28)),
            pointerEvents: 'none',
            background: 'rgba(14,15,12,0.92)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 10px rgba(0,0,0,0.35)',
          }}
        >
          {formatResizeDelta(resizePreview, settings.ppq)}
        </div>
      )}
      {propsPopup && (
        <NotePropertiesPopup
          trackId={propsPopup.trackId}
          noteId={propsPopup.noteId}
          x={propsPopup.x}
          y={propsPopup.y}
          onClose={() => setPropsPopup(null)}
        />
      )}
    </div>
  );
};

// ── Tooltip formatter ──────────────────────────────────────────────────────
function formatMoveDelta(dT: number, dP: number, ppq: number): string {
  const parts: string[] = [];
  if (dT !== 0) {
    const beats = dT / ppq;
    const sign  = beats > 0 ? '+' : '';
    const value = beats.toFixed(beats % 1 === 0 ? 0 : 2);
    parts.push(`${sign}${value}박`);
  }
  if (dP !== 0) {
    const sign = dP > 0 ? '+' : '';
    parts.push(`${sign}${dP}반음`);
  }
  return parts.join(', ');
}

function formatResizeDelta(
  rp: { dT: number; shift: boolean; endTick: number },
  ppq: number,
): string {
  if (rp.shift) {
    const beats = rp.endTick / ppq;
    return `끝점 정렬 → ${beats.toFixed(beats % 1 === 0 ? 0 : 2)}박`;
  }
  if (rp.dT === 0) return '길이 0';
  const beats = rp.dT / ppq;
  const sign  = beats > 0 ? '+' : '';
  return `길이 ${sign}${beats.toFixed(beats % 1 === 0 ? 0 : 2)}박`;
}

function makeSvgCursor(svgBody: string, hotX: number, hotY: number, fallback: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.55"/>
      </filter>
      <g filter="url(#s)">${svgBody}</g>
    </svg>
  `;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;
}
