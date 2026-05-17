import type { Viewport } from '../types/music';

/** Convert a tick value to a canvas X pixel coordinate */
export function tickToX(tick: number, vp: Viewport): number {
  return tick * vp.pixelsPerTick - vp.scrollX;
}

/** Convert a canvas X pixel to a tick value */
export function xToTick(x: number, vp: Viewport): number {
  return (x + vp.scrollX) / vp.pixelsPerTick;
}

/** Convert a MIDI pitch to a canvas Y pixel coordinate (top of key rect) */
export function pitchToY(pitch: number, vp: Viewport, totalKeys = 128): number {
  const noteIndex = totalKeys - 1 - pitch;
  return noteIndex * vp.keyHeight - vp.scrollY;
}

/** Convert a canvas Y pixel to a MIDI pitch */
export function yToPitch(y: number, vp: Viewport, totalKeys = 128): number {
  const noteIndex = Math.floor((y + vp.scrollY) / vp.keyHeight);
  return totalKeys - 1 - noteIndex;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
