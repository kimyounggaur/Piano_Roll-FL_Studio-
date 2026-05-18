import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { tickToX, clamp } from '../../utils/geometry';
import type { Note } from '../../types/music';

interface Props {
  width: number;
  height: number;
}

// ── Layout constants ──────────────────────────────────────────────────────
const BAR_WIDTH       = 4;     // pixel width of one velocity column
const HIT_TOLERANCE_X = 6;     // ± px around a bar's centre that counts as a hit
const TOP_PAD         = 6;     // top padding so velocity 127 doesn't touch the top edge
const BOTTOM_PAD      = 2;     // bottom padding so velocity 1 stays visible

// ── Local geometry helpers ─────────────────────────────────────────────────
function velocityToY(vel: number, height: number): number {
  const usable = height - TOP_PAD - BOTTOM_PAD;
  return TOP_PAD + (1 - clamp(vel, 1, 127) / 127) * usable;
}
function yToVelocity(y: number, height: number): number {
  const usable = height - TOP_PAD - BOTTOM_PAD;
  const frac   = (y - TOP_PAD) / usable;
  return clamp(Math.round((1 - frac) * 127), 1, 127);
}

// ──────────────────────────────────────────────────────────────────────────
type DragMode = 'none' | 'single' | 'multi' | 'pencil';
interface DragState {
  mode: DragMode;
  noteId?: string;
  painted: Set<string>; // pencil-mode dedup so we don't spam updateNote
}

export const VelocityLane: React.FC<Props> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState>({ mode: 'none', painted: new Set() });

  const {
    project, viewport,
    updateNote, selectNote, setVelocityForSelectedNotes,
  } = useProjectStore();
  const vp = viewport;
  const activeTrack = project.tracks.find((t) => t.id === project.activeTrackId) ?? null;

  // Hover tooltip — { x, y, velocity, noteId? }
  const [hover, setHover] = useState<
    { x: number; y: number; velocity: number; noteId: string | null } | null
  >(null);

  // ── Hit test: which note's bar (if any) is under the cursor? ───────────
  const hitTest = useCallback(
    (cx: number, cy: number): Note | null => {
      if (!activeTrack) return null;
      let best: Note | null = null;
      let bestDist = Infinity;
      for (const note of activeTrack.notes) {
        const bx = tickToX(note.startTick, vp);
        if (bx < -BAR_WIDTH || bx > width + BAR_WIDTH) continue;
        const dx = Math.abs(bx + BAR_WIDTH / 2 - cx);
        if (dx > HIT_TOLERANCE_X) continue;
        const barTop = velocityToY(note.velocity, height);
        // Vertical tolerance: anywhere from the bar top down to the lane bottom
        if (cy < barTop - 4 || cy > height) continue;
        if (dx < bestDist) { best = note; bestDist = dx; }
      }
      return best;
    },
    [activeTrack, vp, width, height],
  );

  // ── Draw ───────────────────────────────────────────────────────────────
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Wise near-black velocity panel
    ctx.fillStyle = '#0a0b09';
    ctx.fillRect(0, 0, width, height);

    // Guide lines + numeric labels on the left edge: 127 / 64 / 1
    ctx.font = '9px sans-serif';
    for (const v of [127, 64, 1]) {
      const y = velocityToY(v, height);
      ctx.strokeStyle = v === 127
        ? 'rgba(159,232,112,0.15)'
        : 'rgba(232,235,230,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      ctx.fillStyle = 'rgba(159,232,112,0.45)';
      ctx.textAlign = 'left';
      ctx.fillText(String(v), 4, y - 2);
    }

    // Bars
    if (activeTrack) {
      for (const note of activeTrack.notes) {
        const x = tickToX(note.startTick, vp);
        if (x + BAR_WIDTH < 0 || x > width) continue;
        const barTop = velocityToY(note.velocity, height);
        const barH   = height - barTop - BOTTOM_PAD;

        const topColor = note.selected ? '#ffd11a' : activeTrack.color;
        const grad = ctx.createLinearGradient(0, barTop, 0, height);
        grad.addColorStop(0, topColor);
        grad.addColorStop(1, 'rgba(14,15,12,0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, barTop, BAR_WIDTH, barH);

        // Handle dot at the bar top
        ctx.fillStyle = note.selected ? '#163300' : topColor;
        ctx.beginPath();
        ctx.arc(x + BAR_WIDTH / 2, barTop, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(x + BAR_WIDTH / 2, barTop, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Section label — top-right, "세기"
    ctx.fillStyle = 'rgba(159,232,112,0.35)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('세기', width - 6, 12);
  }, [width, height, vp, activeTrack]);

  useEffect(() => { draw(); });

  // ── Mouse handlers ─────────────────────────────────────────────────────
  const getCursor = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
    },
    [],
  );

  const applyBarValue = useCallback(
    (mode: DragMode, noteId: string | undefined, vel: number) => {
      if (!activeTrack) return;
      if (mode === 'multi') {
        setVelocityForSelectedNotes(vel);
      } else if (mode === 'single' && noteId) {
        updateNote(activeTrack.id, noteId, { velocity: vel });
      }
    },
    [activeTrack, updateNote, setVelocityForSelectedNotes],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!activeTrack) return;
      const { cx, cy } = getCursor(e);
      const vel = yToVelocity(cy, height);
      const hit = hitTest(cx, cy);

      if (hit) {
        // Select the note if it isn't already part of the selection
        if (!hit.selected) {
          selectNote(activeTrack.id, hit.id, e.shiftKey || e.ctrlKey || e.metaKey);
        }
        // Are there multiple selected notes including the hit one?
        const multi = hit.selected && activeTrack.notes.filter((n) => n.selected).length > 1;
        dragRef.current = {
          mode: multi ? 'multi' : 'single',
          noteId: hit.id,
          painted: new Set([hit.id]),
        };
        applyBarValue(dragRef.current.mode, hit.id, vel);
      } else {
        // Pencil mode: paint over notes the cursor passes (none directly under)
        dragRef.current = { mode: 'pencil', painted: new Set() };
      }
    },
    [activeTrack, height, hitTest, selectNote, getCursor, applyBarValue],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { cx, cy } = getCursor(e);
      const vel = yToVelocity(cy, height);
      const d = dragRef.current;

      // Tooltip — also update during drag
      const hovered = hitTest(cx, cy);
      setHover({ x: cx, y: cy, velocity: vel, noteId: hovered?.id ?? null });

      if (d.mode === 'none' || !activeTrack) return;

      if (d.mode === 'pencil') {
        // For every note whose x is near the cursor, push its velocity once per stroke
        for (const note of activeTrack.notes) {
          const bx = tickToX(note.startTick, vp);
          if (Math.abs(bx + BAR_WIDTH / 2 - cx) <= HIT_TOLERANCE_X) {
            if (note.velocity !== vel) {
              updateNote(activeTrack.id, note.id, { velocity: vel });
            }
            d.painted.add(note.id);
          }
        }
        return;
      }

      applyBarValue(d.mode, d.noteId, vel);
    },
    [activeTrack, height, vp, hitTest, getCursor, applyBarValue, updateNote],
  );

  const endDrag = useCallback(() => {
    dragRef.current = { mode: 'none', painted: new Set() };
  }, []);

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'ns-resize', position: 'absolute', top: 0, left: 0 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={() => { endDrag(); setHover(null); }}
      />
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: clamp(hover.x + 10, 0, Math.max(0, width - 90)),
            top:  clamp(hover.y - 24, 0, Math.max(0, height - 22)),
            pointerEvents: 'none',
            background: 'rgba(14,15,12,0.92)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
          }}
        >
          세기 {hover.velocity}{hover.noteId ? '' : ' (그리기)'}
        </div>
      )}
    </div>
  );
};
