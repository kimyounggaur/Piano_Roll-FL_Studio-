import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { tickToX, xToTick, pitchToY, yToPitch, clamp, rectsIntersect } from '../../utils/geometry';
import { snapUnitToTicks } from '../../utils/time';
import { hasNoteAt, noteCellKey, notesUnder } from '../../utils/notes';
import { isBlackKey, isInScale, snapPitchToScale, buildChord } from '../../utils/musicTheory';
import type { Note } from '../../types/music';
import { NOTE_COLOR_GROUPS } from '../../types/music';

const TOTAL_KEYS = 128;
const RESIZE_HANDLE_PX = 6;

interface DragState {
  type: 'none' | 'draw' | 'move' | 'resize' | 'select-box' | 'paint' | 'paint-erase';
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

    // ── Ghost notes — Wise muted overlay ──
    if (settings.ghostNotesVisible) {
      const soloActive = project.tracks.some((tr) => tr.solo);
      for (const track of project.tracks) {
        if (track.id === project.activeTrackId) continue;
        const hidden = track.muted || (soloActive && !track.solo);
        if (hidden) continue;
        ctx.globalAlpha = 0.22;
        for (const note of track.notes) {
          if (note.muted) continue;
          const x = tickToX(note.startTick, vp);
          const w = note.durationTicks * vp.pixelsPerTick;
          const y = pitchToY(note.pitch, vp);
          if (x + w < 0 || x > width) continue;
          ctx.fillStyle = track.color;
          ctx.fillRect(x, y + 1, Math.max(2, w - 1), vp.keyHeight - 2);
        }
        ctx.globalAlpha = 1;
      }
    }

    // ── Active track notes — Wise Green notes ──
    const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId);
    if (activeTrack) {
      for (const note of activeTrack.notes) {
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
        if (x + w < 0 || x > width) continue;
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
  }, [width, height, vp, project, settings, totalTicks, movePreview, resizePreview, selectionRect]);

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
  const hitTest = useCallback(
    (cx: number, cy: number): { note: Note; trackId: string; isResize: boolean } | null => {
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
          const isResize = cx >= nx + nw - RESIZE_HANDLE_PX;
          return { note, trackId: activeTrack.id, isResize };
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

  // Double-click on a ghost note → activate its track (option-gated).
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!settings.ghostDoubleClickActivates || !settings.ghostNotesVisible) return;
      const { cx, cy } = getCursorPos(e);
      const soloActive = project.tracks.some((tr) => tr.solo);
      // Iterate non-active, visible tracks in reverse so top-drawn note wins
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
    [settings.ghostDoubleClickActivates, settings.ghostNotesVisible, project, vp, getCursorPos, setActiveTrack],
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
          // Ensure the clicked note is part of the selection.  If it was
          // already selected, leave the existing multi-selection intact so
          // dragging moves the whole group.
          if (!hit.note.selected) {
            selectNote(hit.trackId, hit.note.id, additive);
          }
          // Alt-drag: clone the selection in place; the copies are now the
          // selection and will follow the drag.
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
          drag.current = {
            type: 'resize',
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
      if (resizePreview) setResizePreview(null);
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
      if (activeTool === 'erase') return 'crosshair';
      if (activeTool === 'select') return 'default';
      const { cx, cy } = getCursorPos(e);
      const hit = hitTest(cx, cy);
      if (hit?.isResize) return 'ew-resize';
      if (hit) return 'grab';
      return 'crosshair';
    },
    [activeTool, hitTest, getCursorPos]
  );

  const [cursor, setCursor] = useState('crosshair');
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
