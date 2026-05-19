import { useCallback, useRef, useState } from 'react';

export interface ArrangementDragRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface UseArrangementDragResult {
  rect: ArrangementDragRect | null;
  beginRubberBand: (x: number, y: number) => void;
  updateRubberBand: (x: number, y: number) => void;
  endRubberBand: () => ArrangementDragRect | null;
  cancelRubberBand: () => void;
}

export function useArrangementDrag(): UseArrangementDragResult {
  const [rect, setRect] = useState<ArrangementDragRect | null>(null);
  const rectRef = useRef<ArrangementDragRect | null>(null);

  const beginRubberBand = useCallback((x: number, y: number) => {
    const next = { x1: x, y1: y, x2: x, y2: y };
    rectRef.current = next;
    setRect(next);
  }, []);

  const updateRubberBand = useCallback((x: number, y: number) => {
    const current = rectRef.current;
    if (!current) return;
    const next = { ...current, x2: x, y2: y };
    rectRef.current = next;
    setRect(next);
  }, []);

  const endRubberBand = useCallback(() => {
    const current = rectRef.current;
    rectRef.current = null;
    setRect(null);
    return current;
  }, []);

  const cancelRubberBand = useCallback(() => {
    rectRef.current = null;
    setRect(null);
  }, []);

  return { rect, beginRubberBand, updateRubberBand, endRubberBand, cancelRubberBand };
}
