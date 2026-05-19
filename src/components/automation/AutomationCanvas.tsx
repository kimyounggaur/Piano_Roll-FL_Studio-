import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { AutomationLane, AutomationCurveType } from '../../types/music';
import { useProjectStore } from '../../store/projectStore';
import {
  valueToCanvasY, canvasYToValue, canvasXToTick, tickToCanvasX,
  findNearestPoint,
} from '../../utils/automationUtils';

type AutoTool = 'select' | 'draw' | 'linear' | 'step' | 'smooth' | 'erase';

interface Props {
  lane: AutomationLane;
  tool: AutoTool;
  width: number;
  height: number;
  scrollX: number;
  pixelsPerTick: number;
  ticksPerBar: number;
}

interface CtxMenu { x: number; y: number; pointId: string }

export const AutomationCanvas: React.FC<Props> = ({
  lane, tool, width, height, scrollX, pixelsPerTick, ticksPerBar,
}) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const addPoint    = useProjectStore((s) => s.addAutomationPoint);
  const removePoint = useProjectStore((s) => s.removeAutomationPoint);
  const updatePoint = useProjectStore((s) => s.updateAutomationPoint);
  const playheadTick = useProjectStore((s) => s.playheadTick);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu]         = useState<CtxMenu | null>(null);
  const dragRef = useRef<{ pointId: string; startX: number; startY: number; origTick: number; origValue: number } | null>(null);
  const lastDrawTick = useRef<number>(-Infinity);

  // ── render ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let h = 0; h <= 4; h++) {
      const y = (h / 4) * height;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    const barPx = ticksPerBar * pixelsPerTick;
    for (let x = -(scrollX % barPx); x < width; x += barPx) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    if (lane.points.length === 0) return;
    const sorted = [...lane.points].sort((a, b) => a.tick - b.tick);

    // Curve fill + stroke
    const color = lane.color;
    ctx.beginPath();
    ctx.moveTo(tickToCanvasX(sorted[0].tick, scrollX, pixelsPerTick), valueToCanvasY(sorted[0].value, height));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const ax = tickToCanvasX(a.tick, scrollX, pixelsPerTick);
      const ay = valueToCanvasY(a.value, height);
      const bx = tickToCanvasX(b.tick, scrollX, pixelsPerTick);
      const by = valueToCanvasY(b.value, height);
      if (b.curveType === 'step' || b.curveType === 'hold') {
        ctx.lineTo(bx, ay);
        ctx.lineTo(bx, by);
      } else if (b.curveType === 'smooth') {
        const cpx = (ax + bx) / 2;
        ctx.bezierCurveTo(cpx, ay, cpx, by, bx, by);
      } else {
        ctx.lineTo(bx, by);
      }
    }
    ctx.strokeStyle = color.replace(')', ', 0.7)').replace('rgb(', 'rgba(').replace('#', '') === color
      ? color
      : color;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Fill below curve
    ctx.lineTo(tickToCanvasX(sorted[sorted.length - 1].tick, scrollX, pixelsPerTick), height);
    ctx.lineTo(tickToCanvasX(sorted[0].tick, scrollX, pixelsPerTick), height);
    ctx.closePath();
    ctx.fillStyle = color + '26'; // ~15% opacity hex
    ctx.fill();

    // Points
    for (const p of sorted) {
      const px = tickToCanvasX(p.tick, scrollX, pixelsPerTick);
      const py = valueToCanvasY(p.value, height);
      const r  = selectedIds.has(p.id) ? 7 : 5;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (selectedIds.has(p.id)) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }

    // Playhead value line
    const phX = tickToCanvasX(playheadTick, scrollX, pixelsPerTick);
    if (phX >= 0 && phX <= width) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,59,48,0.6)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [lane, width, height, scrollX, pixelsPerTick, ticksPerBar, selectedIds, playheadTick]);

  // ── interactions ─────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setCtxMenu(null);
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cx   = e.clientX - rect.left;
    const cy   = e.clientY - rect.top;
    const tick  = canvasXToTick(cx, scrollX, pixelsPerTick);
    const value = canvasYToValue(cy, height);

    if (tool === 'erase') {
      const id = findNearestPoint(lane.points, cx, cy, scrollX, pixelsPerTick, height);
      if (id) removePoint(lane.id, id);
      return;
    }

    if (tool === 'draw') {
      const minInterval = 16;
      if (tick - lastDrawTick.current >= minInterval) {
        addPoint(lane.id, { tick: Math.round(tick), value: Math.max(0, Math.min(1, value)), curveType: 'linear' });
        lastDrawTick.current = tick;
      }
      const handleMove = (me: MouseEvent) => {
        const r2 = (e.currentTarget as HTMLCanvasElement)?.getBoundingClientRect();
        if (!r2) return;
        const mx = me.clientX - r2.left;
        const my = me.clientY - r2.top;
        const mt = canvasXToTick(mx, scrollX, pixelsPerTick);
        const mv = canvasYToValue(my, height);
        if (mt - lastDrawTick.current >= minInterval) {
          addPoint(lane.id, { tick: Math.round(mt), value: Math.max(0, Math.min(1, mv)), curveType: 'linear' });
          lastDrawTick.current = mt;
        }
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', () => window.removeEventListener('mousemove', handleMove), { once: true });
      return;
    }

    if (tool === 'select') {
      const id = findNearestPoint(lane.points, cx, cy, scrollX, pixelsPerTick, height);
      if (id) {
        setSelectedIds((prev) => new Set(e.shiftKey ? [...prev, id] : [id]));
        const pt = lane.points.find((p) => p.id === id);
        if (pt) {
          dragRef.current = { pointId: id, startX: e.clientX, startY: e.clientY, origTick: pt.tick, origValue: pt.value };
          const handleMove = (me: MouseEvent) => {
            const d = dragRef.current;
            if (!d) return;
            const dxPx   = me.clientX - d.startX;
            const dyPx   = me.clientY - d.startY;
            const newTick  = Math.max(0, Math.round(d.origTick + dxPx / pixelsPerTick));
            const newValue = Math.max(0, Math.min(1, d.origValue - dyPx / height));
            updatePoint(lane.id, d.pointId, { tick: newTick, value: newValue });
          };
          window.addEventListener('mousemove', handleMove);
          window.addEventListener('mouseup', () => { dragRef.current = null; window.removeEventListener('mousemove', handleMove); }, { once: true });
        }
      } else {
        setSelectedIds(new Set());
      }
      return;
    }

    // linear / step / smooth: change curveType of nearest point
    const curveMap: Record<string, AutomationCurveType> = { linear: 'linear', step: 'step', smooth: 'smooth' };
    const curveType = curveMap[tool];
    if (curveType) {
      const id = findNearestPoint(lane.points, cx, cy, scrollX, pixelsPerTick, height);
      if (id) updatePoint(lane.id, id, { curveType });
    }
  }, [tool, lane, scrollX, pixelsPerTick, height, addPoint, removePoint, updatePoint]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const cx   = e.clientX - rect.left;
    const cy   = e.clientY - rect.top;
    const id = findNearestPoint(lane.points, cx, cy, scrollX, pixelsPerTick, height);
    if (id) setCtxMenu({ x: e.clientX, y: e.clientY, pointId: id });
  }, [lane, scrollX, pixelsPerTick, height]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      for (const id of selectedIds) removePoint(lane.id, id);
      setSelectedIds(new Set());
    }
  }, [selectedIds, removePoint, lane.id]);

  return (
    <div className="automation-canvas-wrap" style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: tool === 'draw' ? 'crosshair' : tool === 'erase' ? 'cell' : 'default' }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      />
      {ctxMenu && (
        <div
          className="curve-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          {(['linear', 'step', 'smooth', 'hold'] as AutomationCurveType[]).map((ct) => (
            <button
              key={ct}
              onClick={() => { updatePoint(lane.id, ctxMenu.pointId, { curveType: ct }); setCtxMenu(null); }}
            >
              {ct === 'linear' ? '╱ 직선' : ct === 'step' ? '┐ 계단' : ct === 'smooth' ? '~ 곡선' : '— 홀드'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
