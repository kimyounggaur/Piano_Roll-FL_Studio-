import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { isBlackKey, isInScale } from '../../utils/musicTheory';
import { getPianoKeyLabel } from '../../utils/geometry';
import * as Tone from 'tone';

const KEYBOARD_WIDTH = 72;

interface Props {
  height: number;
}

// ── Shared preview synth — created lazily, reused across clicks ──────────────
let previewSynth: Tone.Synth | null = null;
function getPreviewSynth(): Tone.Synth {
  if (!previewSynth) {
    previewSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope:   { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.5 },
    }).toDestination();
  }
  return previewSynth;
}

export const PianoKeyboard: React.FC<Props> = ({ height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { viewport, project } = useProjectStore();
  const { scrollY, zoomY, rowHeight, minPitch, maxPitch } = viewport;
  const { settings } = project;
  const keyH = rowHeight * zoomY;

  const [hoverPitch, setHoverPitch] = useState<number | null>(null);

  // ── y ↔ pitch (local helpers — respect viewport.maxPitch as the top row) ─
  const yToPitch = useCallback(
    (y: number): number => {
      const idx = Math.floor((y + scrollY) / keyH);
      return maxPitch - idx;
    },
    [scrollY, keyH, maxPitch],
  );

  const pitchToY = useCallback(
    (pitch: number): number => (maxPitch - pitch) * keyH - scrollY,
    [scrollY, keyH, maxPitch],
  );

  // ── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = KEYBOARD_WIDTH * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${KEYBOARD_WIDTH}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Wise near-black keyboard background
    ctx.fillStyle = '#0e0f0c';
    ctx.fillRect(0, 0, KEYBOARD_WIDTH, height);

    // Visible pitch range (clamped to viewport.minPitch / maxPitch)
    const topIdx    = Math.floor(scrollY / keyH);
    const bottomIdx = Math.ceil((scrollY + height) / keyH);
    const topPitch    = Math.min(maxPitch, maxPitch - topIdx);
    const bottomPitch = Math.max(minPitch, maxPitch - bottomIdx);
    const scaleActive = settings.scaleName !== 'none';

    for (let pitch = bottomPitch; pitch <= topPitch; pitch++) {
      const y = pitchToY(pitch);
      const black   = isBlackKey(pitch);
      const inScale = isInScale(pitch, settings.scaleRoot, settings.scaleName);
      const hovered = hoverPitch === pitch;

      if (black) {
        // Black key: near-black left, slightly lifted right edge for depth
        ctx.fillStyle = '#0e0f0c';
        ctx.fillRect(0, y, KEYBOARD_WIDTH * 0.62, keyH - 1);
        ctx.fillStyle = '#1e2018';
        ctx.fillRect(KEYBOARD_WIDTH * 0.62, y, KEYBOARD_WIDTH * 0.38, keyH - 1);
      } else {
        // White key: Wise Light Surface, Mint tint if in active scale
        ctx.fillStyle = scaleActive && inScale ? '#d4f0b5' : '#e8ebe6';
        ctx.fillRect(0, y, KEYBOARD_WIDTH - 1, keyH - 1);
        ctx.fillStyle = 'rgba(14,15,12,0.05)';
        ctx.fillRect(0, y, KEYBOARD_WIDTH - 1, 1);
      }

      // Wise Green tint on in-scale black keys
      if (black && scaleActive && inScale) {
        ctx.fillStyle = 'rgba(159,232,112,0.18)';
        ctx.fillRect(0, y, KEYBOARD_WIDTH * 0.62, keyH - 1);
      }

      // Hover highlight — Wise Green wash
      if (hovered) {
        ctx.fillStyle = 'rgba(159,232,112,0.32)';
        ctx.fillRect(0, y, KEYBOARD_WIDTH - 1, keyH - 1);
      }

      // C-octave labels — Wise Dark Green on white, accent on black
      if (pitch % 12 === 0 && keyH >= 10) {
        ctx.fillStyle = black ? '#9fe870' : '#163300';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(getPianoKeyLabel(pitch), KEYBOARD_WIDTH - 4, y + keyH - 3);
      }

      // Thin separator
      ctx.fillStyle = 'rgba(14,15,12,0.25)';
      ctx.fillRect(0, y + keyH - 1, KEYBOARD_WIDTH, 1);
    }
  }, [height, scrollY, keyH, minPitch, maxPitch, settings.scaleRoot, settings.scaleName, hoverPitch, pitchToY]);

  useEffect(() => { draw(); }, [draw]);

  // ── Tone.js preview — short triggerAttackRelease on the shared synth ─────
  const playNote = useCallback((pitch: number) => {
    void Tone.start().then(() => {
      const freq = Tone.Frequency(pitch, 'midi').toFrequency();
      getPreviewSynth().triggerAttackRelease(freq, '8n');
    });
  }, []);

  // ── Mouse handlers ───────────────────────────────────────────────────────
  const getEventPitch = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): number | null => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const pitch = yToPitch(e.clientY - rect.top);
      if (pitch < minPitch || pitch > maxPitch) return null;
      return pitch;
    },
    [yToPitch, minPitch, maxPitch],
  );

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pitch = getEventPitch(e);
    if (pitch != null) playNote(pitch);
  }, [getEventPitch, playNote]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pitch = getEventPitch(e);
    if (pitch !== hoverPitch) setHoverPitch(pitch);
  }, [getEventPitch, hoverPitch]);

  const handleMouseLeave = useCallback(() => setHoverPitch(null), []);

  return (
    <canvas
      ref={canvasRef}
      className="piano-keyboard-canvas"
      style={{ cursor: 'pointer', flexShrink: 0, display: 'block' }}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
};
