// ═══════════════════════════════════════════════════════════════════
//  Background waveform helpers (#52)
//  Audio is decoded into a peak array (float pairs: min/max per bucket)
//  which is small enough to keep in memory or stash in IndexedDB.
// ═══════════════════════════════════════════════════════════════════

export interface WaveformData {
  peaks: Float32Array;     // interleaved min,max,min,max,... per bucket
  bucketCount: number;
  sampleRate: number;
  lengthSec: number;
  offsetTick: number;
  /** Optional ticks-per-second cached at import time; consumers can recompute. */
  ticksPerSecond: number;
}

/** Decode any browser-supported audio File to an AudioBuffer. */
export async function decodeAudio(file: File): Promise<AudioBuffer> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const arr = await file.arrayBuffer();
  try {
    return await ctx.decodeAudioData(arr);
  } finally {
    void ctx.close();
  }
}

/** Reduce an AudioBuffer to `bucketCount` min/max pairs (interleaved). */
export function extractPeaks(buffer: AudioBuffer, bucketCount: number): Float32Array {
  const channel = buffer.getChannelData(0);     // mono peak source
  const len = channel.length;
  const bucketSize = Math.max(1, Math.floor(len / bucketCount));
  const out = new Float32Array(bucketCount * 2);
  for (let b = 0; b < bucketCount; b++) {
    const start = b * bucketSize;
    const end = Math.min(len, start + bucketSize);
    let min = 1, max = -1;
    for (let i = start; i < end; i++) {
      const v = channel[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b * 2]     = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

/** Draw the peak array onto an existing canvas context. Caller manages clear/scroll. */
export function renderPeaksToCanvas(
  ctx: CanvasRenderingContext2D,
  data: WaveformData,
  x: number, y: number, w: number, h: number,
  color = 'rgba(232,235,230,0.18)',
): void {
  if (data.bucketCount === 0) return;
  const midY = y + h / 2;
  ctx.fillStyle = color;
  const stride = data.bucketCount / w;
  for (let px = 0; px < w; px++) {
    const bi = Math.floor(px * stride);
    const min = data.peaks[bi * 2];
    const max = data.peaks[bi * 2 + 1];
    const y1 = midY - max * (h / 2);
    const y2 = midY - min * (h / 2);
    ctx.fillRect(x + px, y1, 1, Math.max(1, y2 - y1));
  }
}
