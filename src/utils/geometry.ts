import type { PianoRollViewport as Viewport, Note } from '../types/music';

export type { Viewport };

// ── Rect type used for hit-testing and selection ────────────────────────────
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Pixels-per-tick at current zoom. Uses legacy field when ppq is omitted. */
function ppt(vp: Viewport, ppq?: number): number {
  return ppq != null ? (vp.beatWidth * vp.zoomX) / ppq : vp.pixelsPerTick;
}

/** Key row height at current zoom. */
function kh(vp: Viewport): number {
  return vp.rowHeight * vp.zoomY;
}

// ── Core coordinate transforms ──────────────────────────────────────────────

/**
 * Convert a tick position to a canvas X coordinate.
 * Pass `ppq` (from project settings) to compute from beatWidth / zoomX;
 * omit to fall back to the legacy `vp.pixelsPerTick` field (backward compat).
 */
export function tickToX(tick: number, vp: Viewport, ppq?: number): number {
  return tick * ppt(vp, ppq) - vp.scrollX;
}

/**
 * Convert a canvas X coordinate to a tick position.
 * Pass `ppq` to compute from beatWidth / zoomX; omit for legacy fallback.
 */
export function xToTick(x: number, vp: Viewport, ppq?: number): number {
  return (x + vp.scrollX) / ppt(vp, ppq);
}

/**
 * Convert a MIDI pitch (0–127) to a canvas Y coordinate (top of the key row).
 * Pitch 127 maps to y=0 (top); pitch 0 maps to the bottom.
 */
export function pitchToY(pitch: number, vp: Viewport): number {
  return (127 - pitch) * kh(vp) - vp.scrollY;
}

/**
 * Convert a canvas Y coordinate to the nearest MIDI pitch (0–127).
 * Returns the pitch whose row contains that Y position.
 */
export function yToPitch(y: number, vp: Viewport): number {
  return 127 - Math.floor((y + vp.scrollY) / kh(vp));
}

// ── Note rect ───────────────────────────────────────────────────────────────

/**
 * Compute the canvas-space bounding rectangle for a note.
 * `w` is the raw pixel width — callers should clamp to a minimum for visibility.
 */
export function noteToRect(note: Note, vp: Viewport, ppq?: number): Rect {
  const scale = ppt(vp, ppq);
  return {
    x: note.startTick * scale - vp.scrollX,
    y: (127 - note.pitch) * kh(vp) - vp.scrollY,
    w: note.durationTicks * scale,
    h: kh(vp),
  };
}

// ── Hit / overlap tests ─────────────────────────────────────────────────────

/** Returns true when point (x, y) lies inside rect (inclusive boundaries). */
export function rectContainsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Returns true when two rects have any overlapping area. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ── Visible range queries ────────────────────────────────────────────────────

/**
 * Return the inclusive [minPitch, maxPitch] range currently visible given the
 * viewport scroll position, row height zoom, and canvas height.
 * Clamped to `[vp.minPitch, vp.maxPitch]`.
 * Requires `vp.height` to be kept up-to-date by the host component.
 */
export function getVisiblePitchRange(vp: Viewport): { minPitch: number; maxPitch: number } {
  const rowH     = kh(vp);
  const topIdx   = Math.floor(vp.scrollY / rowH);
  const botIdx   = Math.ceil((vp.scrollY + vp.height) / rowH);
  const topPitch = clamp(127 - topIdx, vp.minPitch, vp.maxPitch);
  const botPitch = clamp(127 - botIdx, vp.minPitch, vp.maxPitch);
  return { minPitch: botPitch, maxPitch: topPitch };
}

/**
 * Return the [startTick, endTick] range currently visible given the viewport
 * scroll position and canvas width.
 * Requires `vp.width` to be kept up-to-date by the host component.
 */
export function getVisibleTickRange(vp: Viewport, ppq?: number): { startTick: number; endTick: number } {
  const scale = ppt(vp, ppq);
  return {
    startTick: Math.max(0, Math.floor(vp.scrollX / scale)),
    endTick:   Math.ceil((vp.scrollX + vp.width) / scale),
  };
}

// ── Snap helper ─────────────────────────────────────────────────────────────

/**
 * Convert a canvas X coordinate to a tick position snapped to the grid.
 * @param snapTicks - grid resolution in ticks (from `snapUnitToTicks`)
 */
export function snapXToTick(
  x: number,
  vp: Viewport,
  ppq: number,
  snapTicks: number,
): number {
  const raw = xToTick(x, vp, ppq);
  return Math.round(raw / snapTicks) * snapTicks;
}

// ── Piano key label ─────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Return the human-readable note name for a MIDI pitch.
 * Middle C (pitch 60) is C4. Examples: 60→"C4", 61→"C#4", 48→"C3".
 */
export function getPianoKeyLabel(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[pitch % 12]}${octave}`;
}

// ── Utility ─────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ═══════════════════════════════════════════════════════════════════
//  Note index — sorted by startTick + cached maxDurationTicks.
//  Lets renderers skip out-of-view notes in O(log N + visible) instead
//  of O(N) per frame. Pure (no React) so it's trivially testable.
// ═══════════════════════════════════════════════════════════════════
export interface NoteIndex {
  sorted: Note[];
  maxDuration: number;
}

export function buildNoteIndex(notes: Note[]): NoteIndex {
  if (notes.length === 0) return { sorted: [], maxDuration: 0 };
  const sorted = notes.slice().sort((a, b) => a.startTick - b.startTick);
  let maxDuration = 0;
  for (const n of sorted) {
    if (n.durationTicks > maxDuration) maxDuration = n.durationTicks;
  }
  return { sorted, maxDuration };
}

/** Smallest index whose note.startTick >= target. Returns sorted.length when none. */
function lowerBound(sorted: Note[], target: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid].startTick < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Iterate every note that *could* overlap `[startTick, endTick)` AND falls
 * within `[minPitch, maxPitch]`. Coarse prefilter — callers still need to
 * do a precise rect-clip for sub-pixel correctness.
 */
export function forEachVisibleNote(
  idx: NoteIndex,
  startTick: number,
  endTick: number,
  minPitch: number,
  maxPitch: number,
  fn: (n: Note) => void,
): void {
  if (idx.sorted.length === 0) return;
  const firstIdx = Math.max(0, lowerBound(idx.sorted, startTick - idx.maxDuration));
  for (let i = firstIdx; i < idx.sorted.length; i++) {
    const n = idx.sorted[i];
    if (n.startTick >= endTick) break;
    if (n.startTick + n.durationTicks < startTick) continue;
    if (n.pitch < minPitch || n.pitch > maxPitch) continue;
    fn(n);
  }
}
