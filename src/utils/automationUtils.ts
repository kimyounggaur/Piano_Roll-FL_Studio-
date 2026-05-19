import type { AutomationLane, AutomationPoint } from '../types/music';

export function interpolateAutomation(lane: AutomationLane, tick: number): number {
  const { points, minValue, maxValue, defaultValue } = lane;
  if (points.length === 0) return defaultValue;

  const sorted = points.slice().sort((a, b) => a.tick - b.tick);

  if (tick <= sorted[0].tick) return sorted[0].value * (maxValue - minValue) + minValue;
  if (tick >= sorted[sorted.length - 1].tick) {
    const last = sorted[sorted.length - 1];
    return last.value * (maxValue - minValue) + minValue;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (tick < a.tick || tick > b.tick) continue;

    const t = (tick - a.tick) / (b.tick - a.tick);

    let normValue: number;
    switch (b.curveType) {
      case 'step':
        normValue = a.value;
        break;
      case 'hold':
        normValue = tick < b.tick ? a.value : b.value;
        break;
      case 'smooth': {
        const tension = b.tension ?? 0.5;
        const t2 = t * t;
        const t3 = t2 * t;
        // Catmull-Rom-like cubic with tension
        normValue = a.value + (b.value - a.value) * (3 * t2 - 2 * t3 + tension * (t3 - 2 * t2 + t));
        break;
      }
      case 'linear':
      default:
        normValue = a.value + (b.value - a.value) * t;
        break;
    }
    return normValue * (maxValue - minValue) + minValue;
  }
  return defaultValue;
}

/** Convert normalized value (0–1) to canvas Y coordinate. */
export function valueToCanvasY(normalizedValue: number, canvasHeight: number): number {
  return (1 - normalizedValue) * canvasHeight;
}

/** Convert canvas Y coordinate to normalized value (0–1). */
export function canvasYToValue(y: number, canvasHeight: number): number {
  return Math.max(0, Math.min(1, 1 - y / canvasHeight));
}

/** Convert canvas X to tick. */
export function canvasXToTick(x: number, scrollX: number, pixelsPerTick: number): number {
  return Math.max(0, (x + scrollX) / pixelsPerTick);
}

/** Convert tick to canvas X. */
export function tickToCanvasX(tick: number, scrollX: number, pixelsPerTick: number): number {
  return tick * pixelsPerTick - scrollX;
}

/** Find the nearest point within hitRadius pixels. Returns point id or null. */
export function findNearestPoint(
  points: AutomationPoint[],
  canvasX: number,
  canvasY: number,
  scrollX: number,
  pixelsPerTick: number,
  canvasHeight: number,
  hitRadius = 10,
): string | null {
  let best: string | null = null;
  let bestDist = hitRadius * hitRadius;

  for (const p of points) {
    const px = tickToCanvasX(p.tick, scrollX, pixelsPerTick);
    const py = valueToCanvasY(p.value, canvasHeight);
    const dist2 = (px - canvasX) ** 2 + (py - canvasY) ** 2;
    if (dist2 < bestDist) {
      bestDist = dist2;
      best = p.id;
    }
  }
  return best;
}
